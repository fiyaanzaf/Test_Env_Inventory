from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr
from typing import Annotated, Optional, List
import psycopg2
import os
from dotenv import load_dotenv
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
import json
from decimal import Decimal

# --- Custom JSON Encoder for Decimal types ---
class DecimalEncoder(json.JSONEncoder):
    """Custom JSON encoder that converts Decimal to float for serialization."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

# --- Load Environment Variables ---
load_dotenv()
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

# --- Security & Token Setup ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/users/login")

# --- Database Connection ---
def get_db_connection():
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            host=DB_HOST,
            port=DB_PORT
        )
        return conn
    except Exception as e:
        print(f"Error connecting to database: {e}")
        return None

# --- Pydantic Models ---
class TokenData(BaseModel):
    username: str | None = None
    roles: List[str] = []

class User(BaseModel):
    id: int
    username: str
    email: EmailStr
    roles: List[str]

class UserInDB(User):
    password_hash: str

# --- Audit Logging Function (NOW UPDATED) ---
def create_audit_log(
    user: User, 
    action: str, 
    request: Request, # <-- NEW: Pass the request object
    target_table: str = None, 
    target_id: int = None, 
    details: dict = None
):
    """
    Writes a new record to the audit_logs table.
    Automatically extracts user_id, username, and ip_address.
    """
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            print("Audit Log Failed: No DB Connection")
            return
            
        cur = conn.cursor()
        # FIX: Use DecimalEncoder to handle Decimal types from PostgreSQL
        details_json = json.dumps(details, cls=DecimalEncoder) if details else None
        
        # --- NEW: Get IP from request ---
        ip_address = request.client.host if request.client else "unknown"
        
        cur.execute(
            """
            INSERT INTO audit_logs (user_id, username, action, ip_address, target_table, target_id, details)
            VALUES (%s, %s, %s, %s, %s, %s, %s);
            """,
            (user.id, user.username, action, ip_address, target_table, target_id, details_json)
        )
        conn.commit()
        cur.close()
    except Exception as e:
        print(f"CRITICAL: FAILED TO WRITE AUDIT LOG: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

# --- NEW: Operation Logging Function (for write-offs and backups) ---
def create_operation_log(
    user: User,
    operation_type: str,  # 'write_off' or 'backup'
    request: Request,
    sub_type: str = None,  # For backups: 'create', 'restore', 'restore_fail'
    target_id: int = None,
    quantity: int = None,
    reason: str = None,
    file_name: str = None,
    details: dict = None
):
    """
    Writes a new record to the operations_log table.
    Used for write-offs and backup operations only.
    """
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            print("Operation Log Failed: No DB Connection")
            return
            
        cur = conn.cursor()
        # FIX: Use DecimalEncoder to handle Decimal types from PostgreSQL
        details_json = json.dumps(details, cls=DecimalEncoder) if details else None
        ip_address = request.client.host if request.client else "unknown"
        
        cur.execute(
            """
            INSERT INTO operations_log 
            (user_id, username, operation_type, sub_type, target_id, quantity, reason, file_name, details, ip_address)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """,
            (user.id, user.username, operation_type, sub_type, target_id, quantity, reason, file_name, details_json, ip_address)
        )
        conn.commit()
        cur.close()
    except Exception as e:
        print(f"CRITICAL: FAILED TO WRITE OPERATION LOG: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

# --- Security Helper Functions ---
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password[:72], hashed_password)

def hash_password(password: str) -> str:
    return pwd_context.hash(password[:72])

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_user_from_db(username: str) -> UserInDB | None:
    conn = None
    try:
        conn = get_db_connection()
        if conn is None: return None
        
        cur = conn.cursor()
        
        cur.execute("SELECT id, username, email, password_hash FROM users WHERE username = %s", (username,))
        user_data = cur.fetchone()
        
        if not user_data:
            cur.close()
            return None
        
        user_id = user_data[0]
        
        cur.execute("""
            SELECT r.name 
            FROM roles r
            JOIN user_roles ur ON r.id = ur.role_id
            WHERE ur.user_id = %s;
        """, (user_id,))
        
        roles_data = cur.fetchall()
        roles_list = [role[0] for role in roles_data]
        
        cur.close()
        
        return UserInDB(
            id=user_id, 
            username=user_data[1], 
            email=user_data[2], 
            roles=roles_list,
            password_hash=user_data[3]
        )
    except Exception as e:
        print(f"Error fetching user: {e}")
        return None
    finally:
        if conn:
            conn.close()

# --- Main Security Dependencies ---
credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)
forbidden_exception = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Operation not permitted: Insufficient privileges."
)

# --- UPDATED: 'get_current_user' now injects 'Request' ---
async def get_current_user(
    request: Request, # <-- NOW INCLUDES Request
    token: Annotated[str, Depends(oauth2_scheme)]
) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        roles: List[str] = payload.get("roles", [])
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username, roles=roles)
    except JWTError:
        raise credentials_exception
    
    user = get_user_from_db(username=token_data.username)
    if user is None:
        raise credentials_exception
    
    # --- AUDIT LOGGING ---
    create_audit_log(
        user=user,
        action="API_ACCESS",
        request=request, # Pass the request
        details={"path": request.url.path}
    )
    
    return user

# --- UPDATED: 'check_role' now injects 'Request' ---
def check_role(required_role: str):
    """
    Returns a dependency function that checks for a required role.
    """
    async def role_checker(
        request: Request, # <-- NOW INCLUDES Request
        current_user: Annotated[User, Depends(get_current_user)]
    ) -> User:
        """
        The actual dependency function.
        """
        if required_role not in current_user.roles:
            # Log the failed authorization attempt
            create_audit_log(
                user=current_user,
                action="AUTH_FAILURE",
                request=request,
                details={"path": request.url.path, "required_role": required_role}
            )
            raise forbidden_exception
            
        return current_user
    
    return role_checker