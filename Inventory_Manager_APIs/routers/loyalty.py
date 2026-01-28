"""
Loyalty Points Router
Handles customer lookup, points earning/redemption, and loyalty settings.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Annotated, Optional
from datetime import datetime

from security import get_db_connection, check_role, User, get_current_user

router = APIRouter(
    prefix="/api/v1/loyalty",
    tags=["Loyalty"]
)


# --------------------------------------------------------------------
# Pydantic Models
# --------------------------------------------------------------------

class CustomerLookupResponse(BaseModel):
    id: int
    name: str
    phone_number: str
    email: Optional[str] = None
    loyalty_points: int


class PointsTransaction(BaseModel):
    customer_id: int
    points: int
    order_id: Optional[int] = None


class RedeemPointsRequest(BaseModel):
    customer_id: int
    points_to_redeem: int


class RedeemPointsResponse(BaseModel):
    success: bool
    points_redeemed: int
    discount_amount: float
    remaining_points: int


class LoyaltySettings(BaseModel):
    earn_per_rupees: int  # Rupees spent to earn 1 point
    redeem_value: float   # Rupee value of 1 point


class UpdateSettingsRequest(BaseModel):
    earn_per_rupees: Optional[int] = None
    redeem_value: Optional[float] = None


# --------------------------------------------------------------------
# Helper Functions
# --------------------------------------------------------------------

def get_loyalty_settings_from_db() -> LoyaltySettings:
    """Fetch current loyalty settings from database."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT key, value FROM loyalty_settings")
        rows = cur.fetchall()
        settings = {row[0]: row[1] for row in rows}
        return LoyaltySettings(
            earn_per_rupees=int(settings.get('earn_per_rupees', 50)),
            redeem_value=float(settings.get('redeem_value', 1))
        )
    finally:
        cur.close()
        conn.close()


def calculate_points_earned(total_amount: float, settings: LoyaltySettings) -> int:
    """Calculate points earned based on purchase amount."""
    if settings.earn_per_rupees <= 0:
        return 0
    return int(total_amount // settings.earn_per_rupees)


# --------------------------------------------------------------------
# 1. Customer Lookup by Phone
# --------------------------------------------------------------------

@router.get("/customer/{phone}", response_model=CustomerLookupResponse)
def lookup_customer_by_phone(
    phone: str,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Look up a customer by phone number.
    Returns customer details including loyalty points balance.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Find customer with 'customer' role
        cur.execute("""
            SELECT u.id, u.username, u.phone_number, u.email, COALESCE(u.loyalty_points, 0)
            FROM users u
            INNER JOIN user_roles ur ON u.id = ur.user_id
            INNER JOIN roles r ON ur.role_id = r.id
            WHERE u.phone_number = %s AND r.name = 'customer'
            LIMIT 1
        """, (phone,))
        
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        return CustomerLookupResponse(
            id=row[0],
            name=row[1],
            phone_number=row[2],
            email=row[3],
            loyalty_points=row[4]
        )
    finally:
        cur.close()
        conn.close()


# --------------------------------------------------------------------
# 2. Add Points (Called after sale completion)
# --------------------------------------------------------------------

@router.post("/add")
def add_loyalty_points(
    transaction: PointsTransaction,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Add loyalty points to a customer account.
    Typically called internally after a sale is completed.
    """
    if transaction.points <= 0:
        return {"success": True, "message": "No points to add", "points_added": 0}
    
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Verify customer exists
        cur.execute("SELECT id, loyalty_points FROM users WHERE id = %s", (transaction.customer_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        current_points = row[1] or 0
        new_points = current_points + transaction.points
        
        # Update points
        cur.execute(
            "UPDATE users SET loyalty_points = %s WHERE id = %s",
            (new_points, transaction.customer_id)
        )
        conn.commit()
        
        return {
            "success": True,
            "message": f"Added {transaction.points} points",
            "points_added": transaction.points,
            "new_balance": new_points
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# --------------------------------------------------------------------
# 3. Redeem Points
# --------------------------------------------------------------------

@router.post("/redeem", response_model=RedeemPointsResponse)
def redeem_loyalty_points(
    request: RedeemPointsRequest,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Redeem loyalty points for a discount.
    Returns the discount amount and remaining points.
    """
    if request.points_to_redeem <= 0:
        raise HTTPException(status_code=400, detail="Points to redeem must be positive")
    
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Get customer current points
        cur.execute("SELECT loyalty_points FROM users WHERE id = %s", (request.customer_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        current_points = row[0] or 0
        
        if request.points_to_redeem > current_points:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient points. Available: {current_points}"
            )
        
        # Get redeem value from settings
        settings = get_loyalty_settings_from_db()
        discount_amount = request.points_to_redeem * settings.redeem_value
        remaining_points = current_points - request.points_to_redeem
        
        # Deduct points
        cur.execute(
            "UPDATE users SET loyalty_points = %s WHERE id = %s",
            (remaining_points, request.customer_id)
        )
        conn.commit()
        
        return RedeemPointsResponse(
            success=True,
            points_redeemed=request.points_to_redeem,
            discount_amount=discount_amount,
            remaining_points=remaining_points
        )
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# --------------------------------------------------------------------
# 4. Get Loyalty Settings
# --------------------------------------------------------------------

@router.get("/settings", response_model=LoyaltySettings)
def get_loyalty_settings(
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Get current loyalty program settings.
    Accessible by all staff to show earn rates to customers.
    """
    return get_loyalty_settings_from_db()


# --------------------------------------------------------------------
# 5. Update Loyalty Settings (Manager/Owner only)
# --------------------------------------------------------------------

@router.put("/settings")
def update_loyalty_settings(
    request: UpdateSettingsRequest,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """
    Update loyalty program settings.
    Only accessible by managers and owners.
    """
    # Check if user has manager or owner role
    allowed_roles = ["manager", "owner"]
    if not any(role in current_user.roles for role in allowed_roles):
        raise HTTPException(status_code=403, detail="Only managers and owners can update loyalty settings")
    
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        updates_made = []
        
        if request.earn_per_rupees is not None:
            if request.earn_per_rupees <= 0:
                raise HTTPException(status_code=400, detail="earn_per_rupees must be positive")
            cur.execute(
                "UPDATE loyalty_settings SET value = %s, updated_at = %s, updated_by = %s WHERE key = 'earn_per_rupees'",
                (str(request.earn_per_rupees), datetime.now(), current_user.id)
            )
            updates_made.append(f"earn_per_rupees = {request.earn_per_rupees}")
        
        if request.redeem_value is not None:
            if request.redeem_value <= 0:
                raise HTTPException(status_code=400, detail="redeem_value must be positive")
            cur.execute(
                "UPDATE loyalty_settings SET value = %s, updated_at = %s, updated_by = %s WHERE key = 'redeem_value'",
                (str(request.redeem_value), datetime.now(), current_user.id)
            )
            updates_made.append(f"redeem_value = {request.redeem_value}")
        
        if not updates_made:
            return {"success": True, "message": "No settings to update"}
        
        conn.commit()
        
        return {
            "success": True,
            "message": f"Updated: {', '.join(updates_made)}",
            "updated_by": current_user.username
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# --------------------------------------------------------------------
# 6. Calculate Points Preview (for checkout UI)
# --------------------------------------------------------------------

@router.get("/calculate/{amount}")
def calculate_points_for_amount(
    amount: float,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Calculate how many points would be earned for a given purchase amount.
    Used by checkout UI to show customers what they'll earn.
    """
    settings = get_loyalty_settings_from_db()
    points = calculate_points_earned(amount, settings)
    
    return {
        "purchase_amount": amount,
        "points_earned": points,
        "earn_rate": f"1 point per ₹{settings.earn_per_rupees}"
    }
