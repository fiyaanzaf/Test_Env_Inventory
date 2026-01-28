from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from typing import Annotated, List, Optional
import psycopg2
import secrets
from datetime import timedelta

# Import security utilities
from security import (
    get_db_connection,
    hash_password,
    verify_password,
    create_access_token,
    get_user_from_db,
    check_role,
    get_current_user,
    User,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)

router = APIRouter()

# --------------------------------------------------------------------
# Pydantic Models
# --------------------------------------------------------------------

class CustomerCreate(BaseModel):
    name: str
    phone_number: str
    email: Optional[str] = None

class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    password: str
    phone_number: str  # <--- UPDATED: Now Mandatory
    role: str  # 'manager', 'employee', 'it_admin'

class Token(BaseModel):
    access_token: str
    token_type: str

class RoleAssignment(BaseModel):
    username: str
    role_name: str

class AssignRoleRequest(BaseModel):
    username: str
    role_name: str

# Request Model for Status Toggling
class ToggleStatusRequest(BaseModel):
    username: str

# Response model for listing users
class UserSummary(BaseModel):
    id: int
    username: str
    phone_number: Optional[str] = None
    email: Optional[str] = None
    roles: List[str]
    is_active: bool  # <--- ADDED: To show blocked status in UI

# --------------------------------------------------------------------
# 1. Create Loyalty Customer (employee / manager)
# --------------------------------------------------------------------

@router.post("/api/v1/customers")
def create_loyalty_customer(
    customer: CustomerCreate,
    current_user: Annotated[User, Depends(check_role("employee"))],
):
    """
    Creates a loyalty customer in the users table with a random internal password.
    """
    conn = None
    try:
        dummy_password = secrets.token_urlsafe(32)
        hashed_password = hash_password(dummy_password)

        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")

        cur = conn.cursor()
        # Default is_active to TRUE
        cur.execute(
            """
            INSERT INTO users (username, email, password_hash, phone_number, is_active)
            VALUES (%s, %s, %s, %s, TRUE)
            RETURNING id, username, email, phone_number;
            """,
            (customer.name, customer.email, hashed_password, customer.phone_number),
        )
        new_user = cur.fetchone()
        new_user_id = new_user[0]

        # assign "customer" role
        cur.execute("SELECT id FROM roles WHERE name = %s", ("customer",))
        role_row = cur.fetchone()
        if not role_row:
            raise HTTPException(status_code=500, detail="Customer role not found")
        role_id = role_row[0]

        cur.execute(
            "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s)",
            (new_user_id, role_id),
        )

        conn.commit()
        cur.close()

        return {
            "status": "success",
            "message": "Loyalty profile created successfully",
            "customer": {
                "id": new_user[0],
                "name": new_user[1],
                "email": new_user[2],
                "phone": new_user[3],
            },
        }

    except Exception as e:
        if conn:
            conn.rollback()
        if "unique constraint" in str(e):
            detail_msg = "Username or Email already exists."
            if "phone_number" in str(e):
                detail_msg = "Phone number already registered."
            raise HTTPException(status_code=409, detail=detail_msg)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# --------------------------------------------------------------------
# 2. Register Internal Staff (IT admin only)
# --------------------------------------------------------------------

@router.post("/api/v1/users/register_staff")
def register_staff(
    user: UserCreate,
    current_admin: Annotated[User, Depends(check_role("it_admin"))],
):
    """
    Creates a staff user. Enforces phone number and active status.
    """
    conn = None
    try:
        if user.role not in ["manager", "employee", "it_admin"]:
            raise HTTPException(status_code=400, detail="Invalid role.")

        hashed_password = hash_password(user.password)
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")

        cur = conn.cursor()
        
        # INSERT with is_active = TRUE
        cur.execute(
            """
            INSERT INTO users (username, email, password_hash, phone_number, is_active)
            VALUES (%s, %s, %s, %s, TRUE)
            RETURNING id;
            """,
            (user.username, user.email, hashed_password, user.phone_number),
        )
        new_user_id = cur.fetchone()[0]

        cur.execute("SELECT id FROM roles WHERE name = %s", (user.role,))
        role_id = cur.fetchone()[0]

        cur.execute(
            "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s)",
            (new_user_id, role_id),
        )

        conn.commit()
        cur.close()

        return {
            "status": "success",
            "message": f"Staff member '{user.username}' created as {user.role}",
        }
    except Exception as e:
        if conn:
            conn.rollback()
        if "unique constraint" in str(e):
            raise HTTPException(status_code=409, detail="User already exists (Check username, email, or phone).")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# --------------------------------------------------------------------
# 3. Log In (Blocks inactive users)
# --------------------------------------------------------------------

@router.post("/api/v1/users/login", response_model=Token)
def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
):
    """
    Logs in staff. Returns JWT.
    UPDATED: Checks if account is blocked (is_active=False).
    """
    try:
        # Note: get_user_from_db needs to return is_active field for this to work perfectly.
        # If your security.py User object doesn't have is_active, we check DB manually here.
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, password_hash, is_active, username FROM users WHERE username = %s", (form_data.username,))
        res = cur.fetchone()
        cur.close()
        conn.close()

        if not res:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id, db_hash, is_active, _ = res

        # 1. Check if Blocked
        if not is_active:
            raise HTTPException(
                status_code=403, 
                detail="Account is blocked. Contact Administrator."
            )

        # 2. Verify Password
        if not verify_password(form_data.password, db_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # 3. Get Roles
        # We fetch full user object to reuse logic or just fetch roles manually
        user = get_user_from_db(form_data.username) # This handles roles fetching in your security.py
        
        # Block pure 'customer' accounts from internal login
        if "customer" in user.roles and len(user.roles) == 1:
            raise HTTPException(
                status_code=403,
                detail="Customer accounts cannot login to the internal system.",
            )

        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username, "roles": user.roles},
            expires_delta=access_token_expires,
        )

        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --------------------------------------------------------------------
# 4. Assign Role (IT admin only)
# --------------------------------------------------------------------

@router.post("/api/v1/users/assign_role")
def assign_role(
    assignment: RoleAssignment,
    current_admin: Annotated[User, Depends(check_role("it_admin"))],
):
    """
    Assign an additional role to an existing user.
    SECURITY: Users cannot modify their own roles (except Owner).
    """
    # SECURITY: Prevent self-role modification (Owner exempt - has ultimate powers)
    is_owner = "owner" in current_admin.roles
    if assignment.username.lower() == current_admin.username.lower() and not is_owner:
        raise HTTPException(
            status_code=403, 
            detail="Security Error: You cannot modify your own roles."
        )
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT id FROM users WHERE username = %s", (assignment.username,))
        u = cur.fetchone()
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        uid = u[0]

        # SECURITY: Check if target user is Owner - only Owner can modify Owner
        cur.execute("""
            SELECT 1 FROM user_roles ur 
            JOIN roles r ON ur.role_id = r.id 
            WHERE ur.user_id = %s AND r.name = 'owner'
        """, (uid,))
        is_target_owner = cur.fetchone() is not None
        if is_target_owner and not is_owner:
            raise HTTPException(
                status_code=403, 
                detail="Forbidden: Only the Owner can modify Owner's roles."
            )

        cur.execute("SELECT id FROM roles WHERE name = %s", (assignment.role_name,))
        r = cur.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Role not found")
        rid = r[0]

        # Check existing
        cur.execute("SELECT 1 FROM user_roles WHERE user_id=%s AND role_id=%s", (uid, rid))
        if cur.fetchone():
            return {"status": "success", "message": "User already has this role"}

        cur.execute(
            "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s)", (uid, rid)
        )
        conn.commit()
        cur.close()

        return {"status": "success", "message": "Role assigned"}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# --------------------------------------------------------------------
# 5. List All Users + Roles + Status
# --------------------------------------------------------------------

@router.get("/api/v1/users", response_model=List[UserSummary])
def get_all_users(
    current_user: Annotated[User, Depends(check_role("manager"))]  # manager+ can view user list (manager, owner, it_admin)
):
    """
    List all users with roles and Active status.
    """
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")

        cur = conn.cursor()
        # UPDATED SQL: Now selects u.is_active
        sql = """
        SELECT u.id,
               u.username,
               u.email,
               u.phone_number,
               COALESCE(
                   array_agg(r.name) FILTER (WHERE r.name IS NOT NULL),
                   ARRAY[]::text[]
               ) AS roles,
               u.is_active
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.id
        GROUP BY u.id, u.username, u.email, u.phone_number, u.is_active
        ORDER BY u.id ASC;
        """
        cur.execute(sql)
        rows = cur.fetchall()
        cur.close()

        users: List[UserSummary] = []
        for row in rows:
            users.append(
                UserSummary(
                    id=row[0],
                    username=row[1],
                    email=row[2] if row[2] else None,
                    phone_number=row[3],
                    roles=row[4] if row[4] else [],
                    is_active=row[5]  # Map DB column to Pydantic
                )
            )
        return users

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@router.get("/api/v1/users/me", response_model=User)
def read_users_me(
    current_user: Annotated[User, Depends(get_current_user)]
):
    return current_user

# --------------------------------------------------------------------
# 6. Update Own Profile
# --------------------------------------------------------------------

class UserProfileUpdate(BaseModel):
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    password: Optional[str] = None
    current_password: Optional[str] = None # New Field

@router.put("/api/v1/users/me", response_model=User)
def update_user_me(
    user_update: UserProfileUpdate,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """
    Update logged-in user's profile (email, phone, password).
    """
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()

        # Update fields if provided
        if user_update.email:
             # Check uniqueness
            cur.execute("SELECT id FROM users WHERE email = %s AND id != %s", (user_update.email, current_user.id))
            if cur.fetchone():
                raise HTTPException(status_code=409, detail="Email already in use")
            cur.execute("UPDATE users SET email = %s WHERE id = %s", (user_update.email, current_user.id))
            current_user.email = user_update.email 

        if user_update.phone_number:
            # Check uniqueness
            cur.execute("SELECT id FROM users WHERE phone_number = %s AND id != %s", (user_update.phone_number, current_user.id))
            if cur.fetchone():
                raise HTTPException(status_code=409, detail="Phone number already in use")
            cur.execute("UPDATE users SET phone_number = %s WHERE id = %s", (user_update.phone_number, current_user.id))
        
        # Password Change Logic
        if user_update.password:
            # 1. Require Current Password
            if not user_update.current_password:
                raise HTTPException(status_code=400, detail="Current password is required to set a new password.")
            
            # 2. Verify Current Password
            # Fetch current hash from DB
            cur.execute("SELECT password_hash FROM users WHERE id = %s", (current_user.id,))
            db_hash = cur.fetchone()[0]
            
            if not verify_password(user_update.current_password, db_hash):
                 raise HTTPException(status_code=401, detail="Incorrect current password")

            # 3. Update Password
            hashed_password = hash_password(user_update.password)
            cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hashed_password, current_user.id))

        conn.commit()
        cur.close()
        
        return current_user

    except HTTPException as he:
        raise he
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()



# --------------------------------------------------------------------
# 6. Role Management (Owner Protected)
# --------------------------------------------------------------------

@router.post("/api/v1/users/remove_role")
def remove_role(
    request: AssignRoleRequest,
    current_admin: Annotated[User, Depends(check_role("it_admin"))]
):
    """
    Removes a specific role.
    PROTECTION: If removing 'manager' role, requester must be 'owner'.
    SECURITY: Users cannot modify their own roles (except Owner).
    """
    is_owner = "owner" in current_admin.roles
    
    # SECURITY: Prevent self-role modification (Owner exempt - has ultimate powers)
    if request.username.lower() == current_admin.username.lower() and not is_owner:
        raise HTTPException(
            status_code=403, 
            detail="Security Error: You cannot modify your own roles."
        )
    
    # 1. Manager Protection Rule
    if request.role_name == "manager" and not is_owner:
        raise HTTPException(status_code=403, detail="Forbidden: Only the Store Owner can remove the 'manager' role.")

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Get User ID
        cur.execute("SELECT id FROM users WHERE username = %s", (request.username,))
        res = cur.fetchone()
        if not res: raise HTTPException(404, "User not found")
        user_id = res[0]

        # SECURITY: Check if target user is Owner - only Owner can modify Owner
        cur.execute("""
            SELECT 1 FROM user_roles ur 
            JOIN roles r ON ur.role_id = r.id 
            WHERE ur.user_id = %s AND r.name = 'owner'
        """, (user_id,))
        is_target_owner = cur.fetchone() is not None
        if is_target_owner and not is_owner:
            raise HTTPException(
                status_code=403, 
                detail="Forbidden: Only the Owner can modify Owner's roles."
            )

        # Get Role ID
        cur.execute("SELECT id FROM roles WHERE name = %s", (request.role_name,))
        res = cur.fetchone()
        if not res: raise HTTPException(404, "Role not found")
        role_id = res[0]

        # Delete
        cur.execute("DELETE FROM user_roles WHERE user_id = %s AND role_id = %s", (user_id, role_id))
        conn.commit()
        
        return {"message": f"Role '{request.role_name}' removed from {request.username}"}
    except HTTPException as he:
        raise he
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


@router.post("/api/v1/users/switch_role")
def switch_role(
    request: AssignRoleRequest,
    current_admin: Annotated[User, Depends(check_role("it_admin"))]
):
    """
    Replaces ALL roles with a new one.
    PROTECTION: If target is currently 'manager', requester must be 'owner'.
    SECURITY: Users cannot modify their own roles (except Owner).
    """
    is_owner = "owner" in current_admin.roles
    
    # SECURITY: Prevent self-role modification (Owner exempt - has ultimate powers)
    if request.username.lower() == current_admin.username.lower() and not is_owner:
        raise HTTPException(
            status_code=403, 
            detail="Security Error: You cannot modify your own roles."
        )

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Get User ID
        cur.execute("SELECT id FROM users WHERE username = %s", (request.username,))
        res = cur.fetchone()
        if not res: raise HTTPException(404, "User not found")
        user_id = res[0]

        # SECURITY: Check if target user is Owner - only Owner can modify Owner
        cur.execute("""
            SELECT 1 FROM user_roles ur 
            JOIN roles r ON ur.role_id = r.id 
            WHERE ur.user_id = %s AND r.name = 'owner'
        """, (user_id,))
        is_target_owner = cur.fetchone() is not None
        if is_target_owner and not is_owner:
            raise HTTPException(
                status_code=403, 
                detail="Forbidden: Only the Owner can modify Owner's roles."
            )

        # Check if target is currently a Manager
        cur.execute("""
            SELECT 1 FROM user_roles ur 
            JOIN roles r ON ur.role_id = r.id 
            WHERE ur.user_id = %s AND r.name = 'manager'
        """, (user_id,))
        is_target_manager = cur.fetchone() is not None

        # 1. Manager Protection Rule
        if is_target_manager and not is_owner:
             raise HTTPException(403, "Forbidden: Only the Store Owner can modify a Manager's role.")

        # Get New Role ID
        cur.execute("SELECT id FROM roles WHERE name = %s", (request.role_name,))
        res = cur.fetchone()
        if not res: raise HTTPException(404, "Target role not found")
        new_role_id = res[0]

        # Atomic Switch
        cur.execute("DELETE FROM user_roles WHERE user_id = %s", (user_id,))
        cur.execute("INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s)", (user_id, new_role_id))
        
        conn.commit()
        return {"message": f"User {request.username} switched to '{request.role_name}'"}
    except HTTPException as he:
        raise he
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# --------------------------------------------------------------------
# 7. Block / Unblock Users (Owner Protected)
# --------------------------------------------------------------------

@router.post("/api/v1/users/toggle_status")
def toggle_user_status(
    request: ToggleStatusRequest,
    current_admin: Annotated[User, Depends(check_role("it_admin"))] 
):
    """
    Toggles is_active status.
    Rule: Only 'owner' can block 'manager' or 'owner'.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Get Target User info
        cur.execute("SELECT id, is_active FROM users WHERE username = %s", (request.username,))
        target = cur.fetchone()
        if not target:
            raise HTTPException(404, "User not found")
        target_id, current_status = target

        # Get Target Roles
        cur.execute("""
            SELECT r.name FROM roles r 
            JOIN user_roles ur ON r.id = ur.role_id 
            WHERE ur.user_id = %s
        """, (target_id,))
        target_roles = [r[0] for r in cur.fetchall()]

        # Permission Check
        current_user_roles = current_admin.roles
        is_owner = "owner" in current_user_roles
        target_is_privileged = "manager" in target_roles or "owner" in target_roles

        if target_is_privileged and not is_owner:
            raise HTTPException(403, "Forbidden: Only the Store Owner can block Managers or other Owners.")

        # Toggle
        new_status = not current_status
        cur.execute("UPDATE users SET is_active = %s WHERE id = %s", (new_status, target_id))
        conn.commit()

        action = "Unblocked" if new_status else "Blocked"
        return {"message": f"User {request.username} has been {action}."}

    except HTTPException as he:
        raise he
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()