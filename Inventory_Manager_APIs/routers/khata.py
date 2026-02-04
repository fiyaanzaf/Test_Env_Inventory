"""
Khata (B2C Credit) Router
Handles customer credit accounts, transactions, and reminders.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from typing import Annotated, List, Optional
from datetime import datetime, date
import os
from dotenv import load_dotenv
import io

from security import get_current_user, User, get_db_connection

router = APIRouter(
    prefix="/api/v1/khata",
    tags=["Khata (B2C Credit)"]
)

load_dotenv()

# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class KhataCustomerCreate(BaseModel):
    name: str
    phone: str
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    credit_limit: Optional[float] = 5000.0
    notes: Optional[str] = None


class KhataCustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    credit_limit: Optional[float] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class KhataCustomerOut(BaseModel):
    id: int
    name: str
    phone: str
    email: Optional[str]
    address: Optional[str]
    credit_limit: float
    current_balance: float
    is_active: bool
    is_blocked: bool
    block_reason: Optional[str]
    balance_status: str  # 'clear', 'normal', 'warning', 'over_limit'
    limit_used_percent: float
    created_at: datetime


class KhataTransactionOut(BaseModel):
    id: int
    type: str  # 'CREDIT_SALE', 'PAYMENT', 'ADJUSTMENT'
    amount: float
    running_balance: float
    sales_order_id: Optional[int]
    invoice_id: Optional[int]
    payment_mode: Optional[str]
    payment_reference: Optional[str]
    notes: Optional[str]
    created_at: datetime
    created_by_name: Optional[str]


class RecordPaymentRequest(BaseModel):
    customer_id: int
    amount: float
    payment_mode: str = "cash"  # 'cash', 'upi', 'bank_transfer', 'cheque'
    payment_reference: Optional[str] = None
    upi_transaction_id: Optional[str] = None
    notes: Optional[str] = None


class KhataDashboard(BaseModel):
    total_credit_outstanding: float
    customers_with_balance: int
    customers_over_limit: int
    customers_near_limit: int  # 80%+ of limit
    total_customers: int


class CustomerLookupResult(BaseModel):
    id: int
    name: str
    phone: str
    current_balance: float
    credit_limit: float
    available_credit: float
    is_blocked: bool
    can_purchase: bool
    warning_message: Optional[str] = None


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_balance_status(balance: float, limit: float) -> str:
    """Determine balance status based on usage."""
    if balance <= 0:
        return 'clear'
    ratio = balance / limit if limit > 0 else 1
    if ratio < 0.8:
        return 'normal'
    elif ratio < 1:
        return 'warning'
    return 'over_limit'


# ============================================================================
# ENDPOINTS
# ============================================================================

# --- Dashboard ---
@router.get("/dashboard", response_model=KhataDashboard)
def get_khata_dashboard(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Get khata system dashboard stats."""
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT 
                COALESCE(SUM(CASE WHEN current_balance > 0 THEN current_balance ELSE 0 END), 0) as total_outstanding,
                COUNT(CASE WHEN current_balance > 0 THEN 1 END) as with_balance,
                COUNT(CASE WHEN current_balance >= credit_limit THEN 1 END) as over_limit,
                COUNT(CASE WHEN current_balance >= credit_limit * 0.8 AND current_balance < credit_limit THEN 1 END) as near_limit,
                COUNT(*) as total
            FROM khata_customers
            WHERE is_active = TRUE;
        """)
        row = cur.fetchone()
        
        return KhataDashboard(
            total_credit_outstanding=float(row[0] or 0),
            customers_with_balance=row[1] or 0,
            customers_over_limit=row[2] or 0,
            customers_near_limit=row[3] or 0,
            total_customers=row[4] or 0
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# --- Customer CRUD ---
@router.post("/customers", response_model=KhataCustomerOut)
def create_khata_customer(
    customer: KhataCustomerCreate,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Create a new khata customer."""
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check for duplicate phone
        cur.execute("SELECT id FROM khata_customers WHERE phone = %s", (customer.phone,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Customer with this phone already exists")
        
        # Get default credit limit from settings if not provided
        credit_limit = customer.credit_limit
        if credit_limit is None:
            cur.execute("SELECT value FROM business_settings WHERE key = 'default_credit_limit'")
            row = cur.fetchone()
            credit_limit = float(row[0]) if row else 5000.0
        
        cur.execute("""
            INSERT INTO khata_customers (name, phone, email, address, credit_limit, notes, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, name, phone, email, address, credit_limit, current_balance, 
                      is_active, is_blocked, block_reason, created_at;
        """, (
            customer.name, customer.phone, customer.email, customer.address,
            credit_limit, customer.notes, current_user.id
        ))
        
        row = cur.fetchone()
        conn.commit()
        
        return KhataCustomerOut(
            id=row[0],
            name=row[1],
            phone=row[2],
            email=row[3],
            address=row[4],
            credit_limit=float(row[5]),
            current_balance=float(row[6]),
            is_active=row[7],
            is_blocked=row[8],
            block_reason=row[9],
            balance_status='clear',
            limit_used_percent=0,
            created_at=row[10]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.get("/customers", response_model=List[KhataCustomerOut])
def get_khata_customers(
    current_user: Annotated[User, Depends(get_current_user)],
    search: Optional[str] = None,
    status: Optional[str] = None,  # 'all', 'with_balance', 'over_limit', 'blocked'
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """Get all khata customers with optional filters."""
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        query = """
            SELECT id, name, phone, email, address, credit_limit, current_balance,
                   is_active, is_blocked, block_reason, created_at
            FROM khata_customers
            WHERE is_active = TRUE
        """
        params = []
        
        if search:
            query += " AND (name ILIKE %s OR phone ILIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])
        
        if status == 'with_balance':
            query += " AND current_balance > 0"
        elif status == 'over_limit':
            query += " AND current_balance >= credit_limit"
        elif status == 'blocked':
            query += " AND is_blocked = TRUE"
        
        query += " ORDER BY current_balance DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        cur.execute(query, params)
        rows = cur.fetchall()
        
        customers = []
        for row in rows:
            balance = float(row[6])
            limit_val = float(row[5])
            customers.append(KhataCustomerOut(
                id=row[0],
                name=row[1],
                phone=row[2],
                email=row[3],
                address=row[4],
                credit_limit=limit_val,
                current_balance=balance,
                is_active=row[7],
                is_blocked=row[8],
                block_reason=row[9],
                balance_status=get_balance_status(balance, limit_val),
                limit_used_percent=round((balance / limit_val) * 100, 1) if limit_val > 0 else 0,
                created_at=row[10]
            ))
        
        return customers
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.get("/customers/lookup", response_model=Optional[CustomerLookupResult])
def lookup_customer_by_phone(
    phone: str,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Quick lookup of khata customer by phone for POS integration."""
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, name, phone, current_balance, credit_limit, is_blocked
            FROM khata_customers
            WHERE phone = %s AND is_active = TRUE;
        """, (phone,))
        
        row = cur.fetchone()
        if not row:
            return None
        
        balance = float(row[3])
        limit_val = float(row[4])
        available = limit_val - balance
        is_blocked = row[5]
        
        # Determine if customer can make credit purchase
        can_purchase = not is_blocked and available > 0
        
        warning = None
        if is_blocked:
            warning = "Customer is blocked due to credit limit exceeded"
        elif available <= 0:
            warning = f"No credit available. Current balance: ₹{balance:.2f}"
        elif balance >= limit_val * 0.8:
            warning = f"Near credit limit. Available: ₹{available:.2f}"
        
        return CustomerLookupResult(
            id=row[0],
            name=row[1],
            phone=row[2],
            current_balance=balance,
            credit_limit=limit_val,
            available_credit=max(0, available),
            is_blocked=is_blocked,
            can_purchase=can_purchase,
            warning_message=warning
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.get("/customers/{customer_id}", response_model=KhataCustomerOut)
def get_khata_customer(
    customer_id: int,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Get single khata customer details."""
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, name, phone, email, address, credit_limit, current_balance,
                   is_active, is_blocked, block_reason, created_at
            FROM khata_customers
            WHERE id = %s;
        """, (customer_id,))
        
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        balance = float(row[6])
        limit_val = float(row[5])
        
        return KhataCustomerOut(
            id=row[0],
            name=row[1],
            phone=row[2],
            email=row[3],
            address=row[4],
            credit_limit=limit_val,
            current_balance=balance,
            is_active=row[7],
            is_blocked=row[8],
            block_reason=row[9],
            balance_status=get_balance_status(balance, limit_val),
            limit_used_percent=round((balance / limit_val) * 100, 1) if limit_val > 0 else 0,
            created_at=row[10]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.put("/customers/{customer_id}", response_model=KhataCustomerOut)
def update_khata_customer(
    customer_id: int,
    update: KhataCustomerUpdate,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Update khata customer details."""
    ALLOWED_ROLES = ["owner", "manager"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Build dynamic update
        updates = []
        params = []
        
        if update.name is not None:
            updates.append("name = %s")
            params.append(update.name)
        if update.email is not None:
            updates.append("email = %s")
            params.append(update.email)
        if update.address is not None:
            updates.append("address = %s")
            params.append(update.address)
        if update.credit_limit is not None:
            updates.append("credit_limit = %s")
            params.append(update.credit_limit)
            # Unblock if new limit is higher than balance
            updates.append("""
                is_blocked = CASE 
                    WHEN current_balance < %s THEN FALSE 
                    ELSE is_blocked 
                END
            """)
            params.append(update.credit_limit)
        if update.notes is not None:
            updates.append("notes = %s")
            params.append(update.notes)
        if update.is_active is not None:
            updates.append("is_active = %s")
            params.append(update.is_active)
        
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(customer_id)
        
        cur.execute(f"""
            UPDATE khata_customers 
            SET {', '.join(updates)}
            WHERE id = %s
            RETURNING id, name, phone, email, address, credit_limit, current_balance,
                      is_active, is_blocked, block_reason, created_at;
        """, params)
        
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        conn.commit()
        
        balance = float(row[6])
        limit_val = float(row[5])
        
        return KhataCustomerOut(
            id=row[0],
            name=row[1],
            phone=row[2],
            email=row[3],
            address=row[4],
            credit_limit=limit_val,
            current_balance=balance,
            is_active=row[7],
            is_blocked=row[8],
            block_reason=row[9],
            balance_status=get_balance_status(balance, limit_val),
            limit_used_percent=round((balance / limit_val) * 100, 1) if limit_val > 0 else 0,
            created_at=row[10]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# --- Transactions ---
@router.get("/customers/{customer_id}/transactions", response_model=List[KhataTransactionOut])
def get_customer_transactions(
    customer_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = Query(50, ge=1, le=200)
):
    """Get transaction history (ledger) for a khata customer."""
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, type, amount, running_balance, sales_order_id, invoice_id,
                   payment_mode, payment_reference, notes, created_at, created_by_name
            FROM khata_transactions
            WHERE customer_id = %s
            ORDER BY created_at DESC
            LIMIT %s;
        """, (customer_id, limit))
        
        rows = cur.fetchall()
        
        return [
            KhataTransactionOut(
                id=row[0],
                type=row[1],
                amount=float(row[2]),
                running_balance=float(row[3]),
                sales_order_id=row[4],
                invoice_id=row[5],
                payment_mode=row[6],
                payment_reference=row[7],
                notes=row[8],
                created_at=row[9],
                created_by_name=row[10]
            )
            for row in rows
        ]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# --- Payments ---
@router.post("/payments", response_model=KhataTransactionOut)
def record_khata_payment(
    payment: RecordPaymentRequest,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Record a payment received from khata customer."""
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if payment.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get current balance
        cur.execute("""
            SELECT current_balance, name FROM khata_customers WHERE id = %s;
        """, (payment.customer_id,))
        
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        current_balance = float(row[0])
        new_balance = current_balance - payment.amount
        
        # Record transaction (negative amount = payment received)
        cur.execute("""
            INSERT INTO khata_transactions (
                customer_id, type, amount, running_balance,
                payment_mode, payment_reference, upi_transaction_id, notes,
                created_by, created_by_name
            )
            VALUES (%s, 'PAYMENT', %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, type, amount, running_balance, sales_order_id, invoice_id,
                      payment_mode, payment_reference, notes, created_at, created_by_name;
        """, (
            payment.customer_id, -payment.amount, new_balance,
            payment.payment_mode, payment.payment_reference, payment.upi_transaction_id,
            payment.notes, current_user.id, current_user.username
        ))
        
        row = cur.fetchone()
        conn.commit()
        
        return KhataTransactionOut(
            id=row[0],
            type=row[1],
            amount=float(row[2]),
            running_balance=float(row[3]),
            sales_order_id=row[4],
            invoice_id=row[5],
            payment_mode=row[6],
            payment_reference=row[7],
            notes=row[8],
            created_at=row[9],
            created_by_name=row[10]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# --- Unblock Customer ---
@router.post("/customers/{customer_id}/unblock")
def unblock_customer(
    customer_id: int,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Manually unblock a khata customer (manager/owner only)."""
    ALLOWED_ROLES = ["owner", "manager"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            UPDATE khata_customers 
            SET is_blocked = FALSE, block_reason = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING id, name;
        """, (customer_id,))
        
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        conn.commit()
        
        return {"message": f"Customer '{row[1]}' has been unblocked", "customer_id": row[0]}
        
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# --- WhatsApp Reminder ---
@router.get("/customers/{customer_id}/whatsapp-reminder")
def get_whatsapp_reminder(
    customer_id: int,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Generate WhatsApp reminder message for khata customer."""
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get customer details
        cur.execute("""
            SELECT kc.name, kc.phone, kc.current_balance,
                   (SELECT value FROM business_settings WHERE key = 'business_name') as store_name,
                   (SELECT value FROM business_settings WHERE key = 'upi_id') as upi_id
            FROM khata_customers kc
            WHERE kc.id = %s;
        """, (customer_id,))
        
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        name, phone, balance, store_name, upi_id = row
        balance = float(balance)
        
        if balance <= 0:
            return {
                "phone": phone,
                "message": f"Dear {name}, your khata balance is clear at {store_name or 'our store'}. Thank you!",
                "balance": balance
            }
        
        # Generate UPI payment link
        upi_link = ""
        if upi_id:
            upi_link = f"\n\nPay directly: upi://pay?pa={upi_id}&pn={store_name or 'Store'}&am={balance}&cu=INR"
        
        message = f"""Dear {name},

Your khata balance at {store_name or 'our store'} is ₹{balance:.2f}

Please clear your dues at your earliest convenience.{upi_link}

Thank you for your business!"""

        return {
            "phone": phone,
            "message": message,
            "balance": balance,
            "upi_link": upi_link.strip() if upi_link else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# --- Top Debtors ---
@router.get("/top-debtors", response_model=List[KhataCustomerOut])
def get_top_debtors(
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = Query(10, ge=1, le=50)
):
    """Get customers with highest outstanding balances."""
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, name, phone, email, address, credit_limit, current_balance,
                   is_active, is_blocked, block_reason, created_at
            FROM khata_customers
            WHERE is_active = TRUE AND current_balance > 0
            ORDER BY current_balance DESC
            LIMIT %s;
        """, (limit,))
        
        rows = cur.fetchall()
        
        customers = []
        for row in rows:
            balance = float(row[6])
            limit_val = float(row[5])
            customers.append(KhataCustomerOut(
                id=row[0],
                name=row[1],
                phone=row[2],
                email=row[3],
                address=row[4],
                credit_limit=limit_val,
                current_balance=balance,
                is_active=row[7],
                is_blocked=row[8],
                block_reason=row[9],
                balance_status=get_balance_status(balance, limit_val),
                limit_used_percent=round((balance / limit_val) * 100, 1) if limit_val > 0 else 0,
                created_at=row[10]
            ))
        
        return customers
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
