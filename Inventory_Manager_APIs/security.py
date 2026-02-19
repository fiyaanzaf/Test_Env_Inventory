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
    phone_number: Optional[str] = None

class UserInDB(User):
    password_hash: str

# ... (omitted audit log functions for brevity in this replace block if not changing them, but I need to be careful with context)
# Actually, I should just target the User class and get_user_from_db function separately or use a larger block. 
# Let's do User class first, then get_user_from_db.

# Wait, `replace_file_content` works on contiguous blocks. 
# `User` class is at line 57.
# `get_user_from_db` is at line 174.
# I will make two calls or use multi_replace. Multi_replace is better.


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
        print(f"DEBUG: Attempting to create operation log: {operation_type} for {user.username}")
        conn = get_db_connection()
        if conn is None:
            print("Operation Log Failed: No DB Connection")
            return
            
        cur = conn.cursor()
        # FIX: Use DecimalEncoder to handle Decimal types from PostgreSQL
        details_json = json.dumps(details, cls=DecimalEncoder) if details else None
        ip_address = (request.client.host if request and request.client else "scanner") if request else "scanner"
        
        cur.execute(
            """
            INSERT INTO operations_log 
            (user_id, username, operation_type, sub_type, target_id, quantity, reason, file_name, details, ip_address)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """,
            (user.id, user.username, operation_type, sub_type, target_id, quantity, reason, file_name, details_json, ip_address)
        )
        conn.commit()
        print(f"DEBUG: Operation log created successfully (Type: {operation_type})")
        cur.close()
    except Exception as e:
        print(f"CRITICAL: FAILED TO WRITE OPERATION LOG: {e}")
        import traceback
        traceback.print_exc()
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
        
        cur.execute("SELECT id, username, email, password_hash, phone_number FROM users WHERE username = %s", (username,))
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
            password_hash=user_data[3],
            phone_number=user_data[4]
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

# --- UPDATED: Role-based access control with separate branches ---
# 
# Role Structure:
#   - OWNER: Top level, can access everything (both operational and system)
#   - IT_ADMIN: System branch - can access system endpoints, NOT operational
#   - MANAGER: Operational branch - can access operational endpoints, NOT system-specific
#   - EMPLOYEE: Operational branch - basic operational access
#   - CUSTOMER: Lowest level, customer-facing only
#
# Hierarchy within branches:
#   Operational: customer < employee < manager < owner
#   System:      it_admin < owner

ROLE_HIERARCHY = {
    'customer': 0,
    'employee': 1,
    'manager': 2,
    'it_admin': 2,  # Parallel to manager but in different branch
    'owner': 3      # Top level - can access everything
}

# Define which roles belong to which branch
OPERATIONAL_ROLES = {'employee', 'manager', 'owner'}  # Owner can access operational
SYSTEM_ROLES = {'it_admin', 'owner'}  # Owner can access system

def check_role(required_role: str):
    """
    Returns a dependency function that checks for a required role.
    
    Access rules:
    - If required_role is 'employee' or 'manager': Only operational roles can access (employee, manager, owner)
    - If required_role is 'it_admin': Only system roles can access (it_admin, owner)
    - If required_role is 'customer': Anyone can access
    - Owner can access everything
    """
    async def role_checker(
        request: Request,
        current_user: Annotated[User, Depends(get_current_user)]
    ) -> User:
        """
        The actual dependency function.
        """
        user_roles = set(current_user.roles)
        
        # Owner can access everything
        if 'owner' in user_roles:
            return current_user
        
        # Check based on required role's branch
        if required_role == 'employee':
            # Employee-level operational endpoint - only operational roles allowed
            # IT admin cannot access employee-level operational tasks
            required_level = ROLE_HIERARCHY.get(required_role, 0)
            has_permission = False
            for user_role in user_roles:
                if user_role in OPERATIONAL_ROLES:
                    user_level = ROLE_HIERARCHY.get(user_role, 0)
                    if user_level >= required_level:
                        has_permission = True
                        break
        elif required_role == 'manager':
            # Manager-level: Both manager AND it_admin can access (shared admin functions)
            # This allows both to access User Management, etc.
            has_permission = ('manager' in user_roles) or ('it_admin' in user_roles)
        elif required_role == 'it_admin':
            # System endpoint - STRICTLY it_admin only (not managers)
            # For System Health, backups, audit logs, etc.
            has_permission = 'it_admin' in user_roles
        elif required_role == 'customer':
            # Customer-level - anyone can access
            has_permission = True
        else:
            # Unknown role - deny by default
            has_permission = False
        
        if not has_permission:
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