"""
B2B & Khata Management Router
Handles wholesale client management, ledger tracking, B2B orders, and payments.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Annotated, List, Optional
from datetime import datetime, date, timedelta
from decimal import Decimal
import io

# PDF Generation
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from security import get_db_connection, check_role, User, get_current_user, create_audit_log

router = APIRouter(
    prefix="/api/v1/b2b",
    tags=["B2B & Khata"]
)


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

# --- Client Models ---
class B2BClientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    contact_person: Optional[str] = None
    phone: str = Field(..., min_length=10, max_length=20)
    email: Optional[str] = None
    gstin: Optional[str] = Field(None, max_length=15)
    address: Optional[str] = None
    credit_limit: float = 10000.0
    price_tier: str = "standard"
    notes: Optional[str] = None


class B2BClientUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    address: Optional[str] = None
    credit_limit: Optional[float] = None
    price_tier: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class B2BClientOut(BaseModel):
    id: int
    name: str
    contact_person: Optional[str]
    phone: str
    email: Optional[str]
    gstin: Optional[str]
    address: Optional[str]
    credit_limit: float
    current_balance: float
    price_tier: str
    is_active: bool
    created_at: datetime
    balance_status: str = "clear"  # 'clear', 'normal', 'warning', 'over_limit'


# --- Order Models ---
class B2BOrderItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(..., gt=0)
    unit_price: float = Field(..., gt=0)


class B2BOrderCreate(BaseModel):
    client_id: int
    items: List[B2BOrderItemCreate]
    notes: Optional[str] = None


class B2BOrderItemOut(BaseModel):
    id: int
    product_id: int
    product_name: str
    sku: str
    quantity: int
    unit_price: float
    unit_cost: Optional[float]
    line_total: float
    margin_percent: Optional[float]


class B2BOrderOut(BaseModel):
    id: int
    client_id: int
    client_name: str
    order_date: datetime
    total_amount: float
    total_cost: float
    status: str
    payment_status: str
    amount_paid: float
    notes: Optional[str]
    items: List[B2BOrderItemOut] = []


# --- Transaction/Khata Models ---
class KhataTransactionOut(BaseModel):
    id: int
    type: str  # 'SALE' or 'PAYMENT'
    amount: float
    running_balance: float
    related_order_id: Optional[int]
    payment_mode: Optional[str]
    payment_reference: Optional[str]
    notes: Optional[str]
    created_at: datetime
    created_by_name: Optional[str]


class RecordPaymentRequest(BaseModel):
    client_id: int
    amount: float = Field(..., gt=0)
    payment_mode: str  # 'cash', 'upi', 'cheque', 'bank_transfer'
    payment_reference: Optional[str] = None
    notes: Optional[str] = None


# --- Dashboard Models ---
class B2BDashboardStats(BaseModel):
    total_to_collect: float
    clients_over_limit: int
    active_clients: int
    net_outstanding: float
    top_debtors: List[B2BClientOut]


# --- Frequent Items & Pricing ---
class FrequentItemOut(BaseModel):
    product_id: int
    product_name: str
    sku: str
    last_sold_price: float
    last_sold_date: datetime
    total_quantity_sold: int
    order_count: int
    current_stock: int
    standard_price: float


class LastPriceOut(BaseModel):
    product_id: int
    product_name: str
    last_sold_price: Optional[float]
    standard_price: float
    unit_cost: float
    suggested_margin: float


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def calculate_balance_status(current_balance: float, credit_limit: float) -> str:
    """Determine the balance status for color coding."""
    if current_balance <= 0:
        return "clear"  # Green - all settled or overpaid
    elif current_balance > credit_limit:
        return "over_limit"  # Red - exceeded limit
    elif current_balance > credit_limit * 0.8:
        return "warning"  # Orange - approaching limit
    else:
        return "normal"  # Orange-light - has balance but ok


def get_running_balance(cur, client_id: int) -> float:
    """Get the current running balance for a client from transactions."""
    cur.execute("""
        SELECT COALESCE(
            (SELECT running_balance FROM b2b_transactions 
             WHERE client_id = %s 
             ORDER BY created_at DESC, id DESC 
             LIMIT 1),
            0
        )
    """, (client_id,))
    result = cur.fetchone()
    return float(result[0]) if result else 0.0


# ============================================================================
# 1. DASHBOARD ENDPOINTS
# ============================================================================

@router.get("/dashboard", response_model=B2BDashboardStats)
def get_b2b_dashboard(
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Get B2B dashboard statistics including total to collect and top debtors.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get dashboard stats from view
        cur.execute("SELECT * FROM v_b2b_dashboard")
        stats = cur.fetchone()
        
        # Get top debtors
        cur.execute("""
            SELECT id, name, contact_person, phone, email, gstin, address,
                   credit_limit, current_balance, price_tier, is_active, created_at
            FROM b2b_clients
            WHERE is_active = TRUE AND current_balance > 0
            ORDER BY current_balance DESC
            LIMIT 5
        """)
        debtors = cur.fetchall()
        
        top_debtors = []
        for d in debtors:
            balance_status = calculate_balance_status(float(d[8]), float(d[7]))
            top_debtors.append(B2BClientOut(
                id=d[0],
                name=d[1],
                contact_person=d[2],
                phone=d[3],
                email=d[4],
                gstin=d[5],
                address=d[6],
                credit_limit=float(d[7]),
                current_balance=float(d[8]),
                price_tier=d[9],
                is_active=d[10],
                created_at=d[11],
                balance_status=balance_status
            ))
        
        return B2BDashboardStats(
            total_to_collect=float(stats[0]) if stats else 0,
            clients_over_limit=stats[1] if stats else 0,
            active_clients=stats[2] if stats else 0,
            net_outstanding=float(stats[3]) if stats else 0,
            top_debtors=top_debtors
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# ============================================================================
# 2. CLIENT CRUD ENDPOINTS
# ============================================================================

@router.get("/clients", response_model=List[B2BClientOut])
def get_all_clients(
    current_user: Annotated[User, Depends(check_role("employee"))],
    search: Optional[str] = None,
    active_only: bool = True,
    sort_by: str = "name"  # 'name', 'balance', 'created'
):
    """
    Get all B2B clients with optional search and filtering.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        query = """
            SELECT id, name, contact_person, phone, email, gstin, address,
                   credit_limit, current_balance, price_tier, is_active, created_at
            FROM b2b_clients
            WHERE 1=1
        """
        params = []
        
        if active_only:
            query += " AND is_active = TRUE"
        
        if search:
            query += " AND (name ILIKE %s OR contact_person ILIKE %s OR phone ILIKE %s)"
            wildcard = f"%{search}%"
            params.extend([wildcard, wildcard, wildcard])
        
        # Sorting
        if sort_by == "balance":
            query += " ORDER BY current_balance DESC"
        elif sort_by == "created":
            query += " ORDER BY created_at DESC"
        else:
            query += " ORDER BY name ASC"
        
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        
        clients = []
        for r in rows:
            balance_status = calculate_balance_status(float(r[8]), float(r[7]))
            clients.append(B2BClientOut(
                id=r[0],
                name=r[1],
                contact_person=r[2],
                phone=r[3],
                email=r[4],
                gstin=r[5],
                address=r[6],
                credit_limit=float(r[7]),
                current_balance=float(r[8]),
                price_tier=r[9],
                is_active=r[10],
                created_at=r[11],
                balance_status=balance_status
            ))
        
        return clients
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.get("/clients/{client_id}", response_model=B2BClientOut)
def get_client(
    client_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Get a single B2B client by ID.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, name, contact_person, phone, email, gstin, address,
                   credit_limit, current_balance, price_tier, is_active, created_at
            FROM b2b_clients
            WHERE id = %s
        """, (client_id,))
        
        r = cur.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Client not found")
        
        balance_status = calculate_balance_status(float(r[8]), float(r[7]))
        
        return B2BClientOut(
            id=r[0],
            name=r[1],
            contact_person=r[2],
            phone=r[3],
            email=r[4],
            gstin=r[5],
            address=r[6],
            credit_limit=float(r[7]),
            current_balance=float(r[8]),
            price_tier=r[9],
            is_active=r[10],
            created_at=r[11],
            balance_status=balance_status
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.post("/clients", response_model=B2BClientOut)
def create_client(
    client: B2BClientCreate,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Create a new B2B client.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check for duplicate phone
        cur.execute("SELECT id FROM b2b_clients WHERE phone = %s", (client.phone,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="A client with this phone number already exists")
        
        # Validate price tier
        if client.price_tier not in ['gold', 'silver', 'standard']:
            raise HTTPException(status_code=400, detail="Invalid price tier. Must be 'gold', 'silver', or 'standard'")
        
        cur.execute("""
            INSERT INTO b2b_clients 
                (name, contact_person, phone, email, gstin, address, 
                 credit_limit, price_tier, notes, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, name, contact_person, phone, email, gstin, address,
                      credit_limit, current_balance, price_tier, is_active, created_at
        """, (
            client.name, client.contact_person, client.phone, client.email,
            client.gstin, client.address, client.credit_limit, client.price_tier,
            client.notes, current_user.id
        ))
        
        r = cur.fetchone()
        conn.commit()
        
        # Audit log
        create_audit_log(
            user=current_user,
            action="CREATE_B2B_CLIENT",
            request=request,
            target_table="b2b_clients",
            target_id=r[0],
            details={"client_name": client.name, "phone": client.phone}
        )
        
        return B2BClientOut(
            id=r[0],
            name=r[1],
            contact_person=r[2],
            phone=r[3],
            email=r[4],
            gstin=r[5],
            address=r[6],
            credit_limit=float(r[7]),
            current_balance=float(r[8]),
            price_tier=r[9],
            is_active=r[10],
            created_at=r[11],
            balance_status="clear"
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


@router.put("/clients/{client_id}", response_model=B2BClientOut)
def update_client(
    client_id: int,
    client: B2BClientUpdate,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Update an existing B2B client.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if client exists
        cur.execute("SELECT id FROM b2b_clients WHERE id = %s", (client_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Build dynamic update query
        update_fields = []
        params = []
        
        if client.name is not None:
            update_fields.append("name = %s")
            params.append(client.name)
        if client.contact_person is not None:
            update_fields.append("contact_person = %s")
            params.append(client.contact_person)
        if client.phone is not None:
            # Check for duplicate phone
            cur.execute("SELECT id FROM b2b_clients WHERE phone = %s AND id != %s", (client.phone, client_id))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Phone number already in use")
            update_fields.append("phone = %s")
            params.append(client.phone)
        if client.email is not None:
            update_fields.append("email = %s")
            params.append(client.email)
        if client.gstin is not None:
            update_fields.append("gstin = %s")
            params.append(client.gstin)
        if client.address is not None:
            update_fields.append("address = %s")
            params.append(client.address)
        if client.credit_limit is not None:
            update_fields.append("credit_limit = %s")
            params.append(client.credit_limit)
        if client.price_tier is not None:
            if client.price_tier not in ['gold', 'silver', 'standard']:
                raise HTTPException(status_code=400, detail="Invalid price tier")
            update_fields.append("price_tier = %s")
            params.append(client.price_tier)
        if client.notes is not None:
            update_fields.append("notes = %s")
            params.append(client.notes)
        if client.is_active is not None:
            update_fields.append("is_active = %s")
            params.append(client.is_active)
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        update_fields.append("updated_at = NOW()")
        params.append(client_id)
        
        query = f"""
            UPDATE b2b_clients 
            SET {', '.join(update_fields)}
            WHERE id = %s
            RETURNING id, name, contact_person, phone, email, gstin, address,
                      credit_limit, current_balance, price_tier, is_active, created_at
        """
        
        cur.execute(query, tuple(params))
        r = cur.fetchone()
        conn.commit()
        
        # Audit log
        create_audit_log(
            user=current_user,
            action="UPDATE_B2B_CLIENT",
            request=request,
            target_table="b2b_clients",
            target_id=client_id,
            details={"updated_fields": list(client.model_dump(exclude_unset=True).keys())}
        )
        
        balance_status = calculate_balance_status(float(r[8]), float(r[7]))
        
        return B2BClientOut(
            id=r[0],
            name=r[1],
            contact_person=r[2],
            phone=r[3],
            email=r[4],
            gstin=r[5],
            address=r[6],
            credit_limit=float(r[7]),
            current_balance=float(r[8]),
            price_tier=r[9],
            is_active=r[10],
            created_at=r[11],
            balance_status=balance_status
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


# ============================================================================
# 3. KHATA/LEDGER ENDPOINTS
# ============================================================================

@router.get("/clients/{client_id}/ledger", response_model=List[KhataTransactionOut])
def get_client_ledger(
    client_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))],
    limit: int = 50,
    offset: int = 0
):
    """
    Get the Khata (ledger) for a specific client.
    Returns transactions in reverse chronological order (newest first).
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verify client exists
        cur.execute("SELECT id FROM b2b_clients WHERE id = %s", (client_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Client not found")
        
        cur.execute("""
            SELECT t.id, t.type, t.amount, t.running_balance, t.related_order_id,
                   t.payment_mode, t.payment_reference, t.notes, t.created_at,
                   u.username as created_by_name
            FROM b2b_transactions t
            LEFT JOIN users u ON t.created_by = u.id
            WHERE t.client_id = %s
            ORDER BY t.created_at DESC, t.id DESC
            LIMIT %s OFFSET %s
        """, (client_id, limit, offset))
        
        rows = cur.fetchall()
        
        return [
            KhataTransactionOut(
                id=r[0],
                type=r[1],
                amount=float(r[2]),
                running_balance=float(r[3]),
                related_order_id=r[4],
                payment_mode=r[5],
                payment_reference=r[6],
                notes=r[7],
                created_at=r[8],
                created_by_name=r[9]
            )
            for r in rows
        ]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# ============================================================================
# 4. PAYMENT RECORDING
# ============================================================================

@router.post("/payments", response_model=KhataTransactionOut)
def record_payment(
    payment: RecordPaymentRequest,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Record a payment from a B2B client.
    Uses FIFO logic to settle oldest invoices first.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verify client exists and get current balance
        cur.execute("""
            SELECT id, name, current_balance 
            FROM b2b_clients 
            WHERE id = %s AND is_active = TRUE
        """, (payment.client_id,))
        client = cur.fetchone()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found or inactive")
        
        client_name = client[1]
        current_balance = float(client[2])
        
        # Calculate new running balance (payment reduces what they owe)
        new_balance = current_balance - payment.amount
        
        # Create the payment transaction
        cur.execute("""
            INSERT INTO b2b_transactions 
                (client_id, type, amount, running_balance, payment_mode, 
                 payment_reference, notes, created_by)
            VALUES (%s, 'PAYMENT', %s, %s, %s, %s, %s, %s)
            RETURNING id, type, amount, running_balance, related_order_id,
                      payment_mode, payment_reference, notes, created_at
        """, (
            payment.client_id, payment.amount, new_balance,
            payment.payment_mode, payment.payment_reference,
            payment.notes, current_user.id
        ))
        
        txn = cur.fetchone()
        
        # FIFO Settlement: Mark oldest unpaid orders as paid
        remaining_payment = payment.amount
        
        cur.execute("""
            SELECT id, total_amount, amount_paid
            FROM b2b_orders
            WHERE client_id = %s AND payment_status != 'paid'
            ORDER BY order_date ASC
        """, (payment.client_id,))
        
        unpaid_orders = cur.fetchall()
        
        for order in unpaid_orders:
            if remaining_payment <= 0:
                break
                
            order_id = order[0]
            order_total = float(order[1])
            already_paid = float(order[2])
            outstanding = order_total - already_paid
            
            if remaining_payment >= outstanding:
                # Fully pay this order
                cur.execute("""
                    UPDATE b2b_orders 
                    SET amount_paid = total_amount, payment_status = 'paid', updated_at = NOW()
                    WHERE id = %s
                """, (order_id,))
                remaining_payment -= outstanding
            else:
                # Partial payment
                new_paid = already_paid + remaining_payment
                cur.execute("""
                    UPDATE b2b_orders 
                    SET amount_paid = %s, payment_status = 'partial', updated_at = NOW()
                    WHERE id = %s
                """, (new_paid, order_id))
                remaining_payment = 0
        
        conn.commit()
        
        # Audit log
        create_audit_log(
            user=current_user,
            action="RECORD_B2B_PAYMENT",
            request=request,
            target_table="b2b_transactions",
            target_id=txn[0],
            details={
                "client_id": payment.client_id,
                "client_name": client_name,
                "amount": payment.amount,
                "payment_mode": payment.payment_mode,
                "new_balance": new_balance
            }
        )
        
        return KhataTransactionOut(
            id=txn[0],
            type=txn[1],
            amount=float(txn[2]),
            running_balance=float(txn[3]),
            related_order_id=txn[4],
            payment_mode=txn[5],
            payment_reference=txn[6],
            notes=txn[7],
            created_at=txn[8],
            created_by_name=current_user.username
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


# ============================================================================
# 5. B2B ORDER ENDPOINTS
# ============================================================================

@router.post("/orders", response_model=B2BOrderOut)
def create_b2b_order(
    order: B2BOrderCreate,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Create a new B2B order.
    - Deducts inventory
    - Creates ledger entry
    - Updates client balance
    - Records item pricing history
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verify client exists and check credit limit
        cur.execute("""
            SELECT id, name, current_balance, credit_limit 
            FROM b2b_clients 
            WHERE id = %s AND is_active = TRUE
        """, (order.client_id,))
        client = cur.fetchone()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found or inactive")
        
        client_name = client[1]
        current_balance = float(client[2])
        credit_limit = float(client[3])
        
        # Calculate order total and validate products
        total_amount = 0.0
        total_cost = 0.0
        order_items_data = []
        
        for item in order.items:
            # Get product details and check stock
            cur.execute("""
                SELECT p.id, p.name, p.sku, p.selling_price, p.average_cost,
                       COALESCE(SUM(ib.quantity), 0) as total_stock
                FROM products p
                LEFT JOIN inventory_batches ib ON p.id = ib.product_id
                WHERE p.id = %s
                GROUP BY p.id
            """, (item.product_id,))
            
            product = cur.fetchone()
            if not product:
                raise HTTPException(status_code=404, detail=f"Product ID {item.product_id} not found")
            
            product_name = product[1]
            sku = product[2]
            standard_price = float(product[3])
            unit_cost = float(product[4]) if product[4] else 0.0
            available_stock = int(product[5])
            
            # Stock check (warning only, don't block)
            if item.quantity > available_stock:
                # We'll still allow the order but could flag as backorder
                pass
            
            line_total = item.quantity * item.unit_price
            line_cost = item.quantity * unit_cost
            
            # Calculate margin
            if unit_cost > 0:
                margin_percent = ((item.unit_price - unit_cost) / unit_cost) * 100
            else:
                margin_percent = None
            
            order_items_data.append({
                "product_id": item.product_id,
                "product_name": product_name,
                "sku": sku,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "unit_cost": unit_cost,
                "line_total": line_total,
                "margin_percent": margin_percent
            })
            
            total_amount += line_total
            total_cost += line_cost
        
        # Check if this order would exceed credit limit
        new_balance = current_balance + total_amount
        if new_balance > credit_limit:
            # Warning but don't block - let the manager decide
            pass
        
        # Create the order
        cur.execute("""
            INSERT INTO b2b_orders 
                (client_id, total_amount, total_cost, status, notes, created_by)
            VALUES (%s, %s, %s, 'completed', %s, %s)
            RETURNING id, order_date
        """, (order.client_id, total_amount, total_cost, order.notes, current_user.id))
        
        order_result = cur.fetchone()
        order_id = order_result[0]
        order_date = order_result[1]
        
        # Create order items and deduct inventory
        created_items = []
        for item_data in order_items_data:
            cur.execute("""
                INSERT INTO b2b_order_items 
                    (order_id, product_id, quantity, unit_price, unit_cost, line_total)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                order_id, item_data["product_id"], item_data["quantity"],
                item_data["unit_price"], item_data["unit_cost"], item_data["line_total"]
            ))
            item_id = cur.fetchone()[0]
            
            # Deduct from inventory using FIFO (oldest batches first)
            remaining_qty = item_data["quantity"]
            cur.execute("""
                SELECT id, quantity 
                FROM inventory_batches 
                WHERE product_id = %s AND quantity > 0
                ORDER BY expiry_date ASC NULLS LAST, received_at ASC
            """, (item_data["product_id"],))
            
            batches = cur.fetchall()
            for batch in batches:
                if remaining_qty <= 0:
                    break
                batch_id = batch[0]
                batch_qty = batch[1]
                
                deduct = min(remaining_qty, batch_qty)
                cur.execute("""
                    UPDATE inventory_batches 
                    SET quantity = quantity - %s 
                    WHERE id = %s
                """, (deduct, batch_id))
                remaining_qty -= deduct
            
            created_items.append(B2BOrderItemOut(
                id=item_id,
                product_id=item_data["product_id"],
                product_name=item_data["product_name"],
                sku=item_data["sku"],
                quantity=item_data["quantity"],
                unit_price=item_data["unit_price"],
                unit_cost=item_data["unit_cost"],
                line_total=item_data["line_total"],
                margin_percent=item_data["margin_percent"]
            ))
        
        # Create ledger entry (SALE type)
        new_running_balance = current_balance + total_amount
        cur.execute("""
            INSERT INTO b2b_transactions 
                (client_id, type, amount, running_balance, related_order_id, created_by)
            VALUES (%s, 'SALE', %s, %s, %s, %s)
        """, (order.client_id, total_amount, new_running_balance, order_id, current_user.id))
        
        conn.commit()
        
        # Audit log
        create_audit_log(
            user=current_user,
            action="CREATE_B2B_ORDER",
            request=request,
            target_table="b2b_orders",
            target_id=order_id,
            details={
                "client_id": order.client_id,
                "client_name": client_name,
                "total_amount": total_amount,
                "item_count": len(order.items)
            }
        )
        
        return B2BOrderOut(
            id=order_id,
            client_id=order.client_id,
            client_name=client_name,
            order_date=order_date,
            total_amount=total_amount,
            total_cost=total_cost,
            status="completed",
            payment_status="unpaid",
            amount_paid=0.0,
            notes=order.notes,
            items=created_items
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


@router.get("/orders/{order_id}", response_model=B2BOrderOut)
def get_b2b_order(
    order_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Get details of a specific B2B order.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get order header
        cur.execute("""
            SELECT o.id, o.client_id, c.name, o.order_date, o.total_amount,
                   o.total_cost, o.status, o.payment_status, o.amount_paid, o.notes
            FROM b2b_orders o
            JOIN b2b_clients c ON o.client_id = c.id
            WHERE o.id = %s
        """, (order_id,))
        
        order = cur.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        # Get order items
        cur.execute("""
            SELECT oi.id, oi.product_id, p.name, p.sku, oi.quantity,
                   oi.unit_price, oi.unit_cost, oi.line_total
            FROM b2b_order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = %s
        """, (order_id,))
        
        items = []
        for i in cur.fetchall():
            unit_cost = float(i[6]) if i[6] else 0
            unit_price = float(i[5])
            margin = ((unit_price - unit_cost) / unit_cost * 100) if unit_cost > 0 else None
            
            items.append(B2BOrderItemOut(
                id=i[0],
                product_id=i[1],
                product_name=i[2],
                sku=i[3],
                quantity=i[4],
                unit_price=unit_price,
                unit_cost=unit_cost,
                line_total=float(i[7]),
                margin_percent=margin
            ))
        
        return B2BOrderOut(
            id=order[0],
            client_id=order[1],
            client_name=order[2],
            order_date=order[3],
            total_amount=float(order[4]),
            total_cost=float(order[5]) if order[5] else 0,
            status=order[6],
            payment_status=order[7],
            amount_paid=float(order[8]) if order[8] else 0,
            notes=order[9],
            items=items
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.get("/clients/{client_id}/orders", response_model=List[B2BOrderOut])
def get_client_orders(
    client_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))],
    limit: int = 20
):
    """
    Get all orders for a specific client.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verify client exists
        cur.execute("SELECT name FROM b2b_clients WHERE id = %s", (client_id,))
        client = cur.fetchone()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        client_name = client[0]
        
        cur.execute("""
            SELECT id, client_id, order_date, total_amount, total_cost,
                   status, payment_status, amount_paid, notes
            FROM b2b_orders
            WHERE client_id = %s
            ORDER BY order_date DESC
            LIMIT %s
        """, (client_id, limit))
        
        orders = []
        for o in cur.fetchall():
            orders.append(B2BOrderOut(
                id=o[0],
                client_id=o[1],
                client_name=client_name,
                order_date=o[2],
                total_amount=float(o[3]),
                total_cost=float(o[4]) if o[4] else 0,
                status=o[5],
                payment_status=o[6],
                amount_paid=float(o[7]) if o[7] else 0,
                notes=o[8],
                items=[]  # Not loading items for list view
            ))
        
        return orders
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# ============================================================================
# 6. SMART PRICING ENDPOINTS
# ============================================================================

@router.get("/clients/{client_id}/frequent-items", response_model=List[FrequentItemOut])
def get_frequent_items(
    client_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))],
    limit: int = 5
):
    """
    Get frequently ordered items for a specific client.
    Used for the "Frequent Items" grid in B2B ordering.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verify client exists
        cur.execute("SELECT id FROM b2b_clients WHERE id = %s", (client_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Client not found")
        
        cur.execute("""
            SELECT 
                h.product_id, p.name, p.sku, h.last_sold_price, h.last_sold_date,
                h.total_quantity_sold, h.order_count, p.selling_price,
                COALESCE(SUM(ib.quantity), 0) as current_stock
            FROM client_item_history h
            JOIN products p ON h.product_id = p.id
            LEFT JOIN inventory_batches ib ON p.id = ib.product_id
            WHERE h.client_id = %s
            GROUP BY h.product_id, p.name, p.sku, h.last_sold_price, 
                     h.last_sold_date, h.total_quantity_sold, h.order_count, p.selling_price
            ORDER BY h.order_count DESC, h.last_sold_date DESC
            LIMIT %s
        """, (client_id, limit))
        
        items = []
        for r in cur.fetchall():
            items.append(FrequentItemOut(
                product_id=r[0],
                product_name=r[1],
                sku=r[2],
                last_sold_price=float(r[3]),
                last_sold_date=r[4],
                total_quantity_sold=r[5],
                order_count=r[6],
                standard_price=float(r[7]),
                current_stock=int(r[8])
            ))
        
        return items
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.get("/clients/{client_id}/last-price/{product_id}", response_model=LastPriceOut)
def get_last_price(
    client_id: int,
    product_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Get the last price charged to a client for a specific product.
    Used for auto-filling prices in B2B ordering.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get product details
        cur.execute("""
            SELECT id, name, selling_price, average_cost
            FROM products
            WHERE id = %s
        """, (product_id,))
        
        product = cur.fetchone()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        product_name = product[1]
        standard_price = float(product[2])
        unit_cost = float(product[3]) if product[3] else 0
        
        # Get last price for this client
        cur.execute("""
            SELECT last_sold_price
            FROM client_item_history
            WHERE client_id = %s AND product_id = %s
        """, (client_id, product_id))
        
        history = cur.fetchone()
        last_price = float(history[0]) if history else None
        
        # Calculate suggested margin (10% above cost)
        suggested_margin = unit_cost * 1.10 if unit_cost > 0 else standard_price
        
        return LastPriceOut(
            product_id=product_id,
            product_name=product_name,
            last_sold_price=last_price,
            standard_price=standard_price,
            unit_cost=unit_cost,
            suggested_margin=suggested_margin
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# ============================================================================
# 7. STATEMENT/REPORT ENDPOINTS
# ============================================================================

@router.get("/clients/{client_id}/statement")
def generate_statement_pdf(
    client_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))],
    days: int = 30
):
    """
    Generate a PDF statement for a client.
    Shows all transactions in the specified period.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get client details
        cur.execute("""
            SELECT name, contact_person, phone, current_balance
            FROM b2b_clients
            WHERE id = %s
        """, (client_id,))
        
        client = cur.fetchone()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        client_name = client[0]
        contact_person = client[1] or ""
        phone = client[2]
        current_balance = float(client[3])
        
        # Get transactions for the period
        start_date = datetime.now() - timedelta(days=days)
        cur.execute("""
            SELECT type, amount, running_balance, payment_mode, 
                   payment_reference, notes, created_at
            FROM b2b_transactions
            WHERE client_id = %s AND created_at >= %s
            ORDER BY created_at ASC
        """, (client_id, start_date))
        
        transactions = cur.fetchall()
        
        # Create PDF
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)
        elements = []
        styles = getSampleStyleSheet()
        
        # Title
        title_style = ParagraphStyle(
            'Title',
            parent=styles['Heading1'],
            fontSize=18,
            alignment=1,
            spaceAfter=20
        )
        elements.append(Paragraph("Account Statement", title_style))
        
        # Client Info
        info_style = ParagraphStyle('Info', parent=styles['Normal'], fontSize=11, spaceAfter=5)
        elements.append(Paragraph(f"<b>Client:</b> {client_name}", info_style))
        if contact_person:
            elements.append(Paragraph(f"<b>Contact:</b> {contact_person}", info_style))
        elements.append(Paragraph(f"<b>Phone:</b> {phone}", info_style))
        elements.append(Paragraph(f"<b>Period:</b> Last {days} days", info_style))
        elements.append(Paragraph(f"<b>Current Balance:</b> ₹{current_balance:,.2f}", info_style))
        elements.append(Spacer(1, 20))
        
        # Transactions Table
        table_data = [["Date", "Type", "Amount", "Balance", "Reference"]]
        
        for txn in transactions:
            txn_type = txn[0]
            amount = float(txn[1])
            balance = float(txn[2])
            payment_mode = txn[3] or ""
            reference = txn[4] or ""
            txn_date = txn[6].strftime("%d-%b-%Y %H:%M")
            
            amount_str = f"+₹{amount:,.2f}" if txn_type == "PAYMENT" else f"-₹{amount:,.2f}"
            ref_str = f"{payment_mode} {reference}".strip() if txn_type == "PAYMENT" else "Sale"
            
            table_data.append([
                txn_date,
                txn_type,
                amount_str,
                f"₹{balance:,.2f}",
                ref_str
            ])
        
        if len(table_data) > 1:
            table = Table(table_data, colWidths=[1.5*inch, 0.8*inch, 1*inch, 1*inch, 1.5*inch])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
            ]))
            elements.append(table)
        else:
            elements.append(Paragraph("No transactions in this period.", styles['Normal']))
        
        # Footer
        elements.append(Spacer(1, 30))
        footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=9, alignment=1)
        elements.append(Paragraph(f"Generated on {datetime.now().strftime('%d-%b-%Y %H:%M')}", footer_style))
        
        doc.build(elements)
        buffer.seek(0)
        
        filename = f"Statement_{client_name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.get("/clients/{client_id}/whatsapp-message")
def get_whatsapp_message(
    client_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Generate a WhatsApp message with payment reminder.
    Returns the phone number and pre-filled message.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT name, contact_person, phone, current_balance
            FROM b2b_clients
            WHERE id = %s
        """, (client_id,))
        
        client = cur.fetchone()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        name = client[0]
        contact = client[1] or name
        phone = client[2]
        balance = float(client[3])
        
        # Clean phone number (remove non-digits, ensure country code)
        clean_phone = ''.join(filter(str.isdigit, phone))
        if not clean_phone.startswith('91') and len(clean_phone) == 10:
            clean_phone = '91' + clean_phone
        
        message = f"Hello {contact},\n\nThis is a friendly reminder that your current outstanding balance is ₹{balance:,.2f}.\n\nPlease arrange for payment at your earliest convenience.\n\nThank you for your business!"
        
        whatsapp_url = f"https://wa.me/{clean_phone}?text={message}"
        
        return {
            "phone": phone,
            "clean_phone": clean_phone,
            "message": message,
            "whatsapp_url": whatsapp_url,
            "current_balance": balance
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


class SendEmailRequest(BaseModel):
    to_email: str
    subject: str
    body: str


@router.post("/clients/{client_id}/send-email")
def send_email_reminder(
    client_id: int,
    email_data: SendEmailRequest,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Send an email reminder to a B2B client.
    Uses SMTP settings from system configuration.
    """
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verify client exists
        cur.execute("SELECT name FROM b2b_clients WHERE id = %s", (client_id,))
        client = cur.fetchone()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Get SMTP settings
        cur.execute("""
            SELECT key, value FROM system_settings 
            WHERE key IN ('smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'business_name')
        """)
        settings = dict(cur.fetchall())
        
        smtp_host = settings.get('smtp_host', '')
        smtp_port = int(settings.get('smtp_port', 587))
        smtp_user = settings.get('smtp_user', '')
        smtp_pass = settings.get('smtp_pass', '')
        smtp_from = settings.get('smtp_from', smtp_user)
        business_name = settings.get('business_name', 'Inventory Manager')
        
        if not smtp_host or not smtp_user or not smtp_pass:
            raise HTTPException(
                status_code=400, 
                detail="Email not configured. Please set SMTP settings in System Settings."
            )
        
        # Create email message
        msg = MIMEMultipart()
        msg['From'] = f"{business_name} <{smtp_from}>"
        msg['To'] = email_data.to_email
        msg['Subject'] = email_data.subject
        
        # Add body
        msg.attach(MIMEText(email_data.body, 'plain'))
        
        # Send email
        try:
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_from, email_data.to_email, msg.as_string())
        except smtplib.SMTPAuthenticationError:
            raise HTTPException(status_code=400, detail="SMTP authentication failed. Check email credentials.")
        except smtplib.SMTPException as smtp_err:
            raise HTTPException(status_code=500, detail=f"Failed to send email: {str(smtp_err)}")
        
        # Log the action
        create_audit_log(
            user=current_user,
            action="EMAIL_SENT",
            request=request,
            target_table="b2b_client",
            target_id=client_id,
            details={"to": email_data.to_email, "subject": email_data.subject}
        )
        conn.commit()
        
        return {"success": True, "message": f"Email sent successfully to {email_data.to_email}"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# ============================================================================
# 8. SETTINGS ENDPOINTS
# ============================================================================

@router.get("/settings")
def get_b2b_settings(
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Get all B2B module settings.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT key, value, description FROM b2b_settings ORDER BY key")
        rows = cur.fetchall()
        
        settings = {}
        for r in rows:
            settings[r[0]] = {
                "value": r[1],
                "description": r[2]
            }
        
        return settings
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.put("/settings/{key}")
def update_b2b_setting(
    key: str,
    value: str,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    """
    Update a B2B module setting. Manager/Owner only.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            UPDATE b2b_settings 
            SET value = %s, updated_at = NOW()
            WHERE key = %s
            RETURNING key, value
        """, (value, key))
        
        result = cur.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Setting not found")
        
        conn.commit()
        
        create_audit_log(
            user=current_user,
            action="UPDATE_B2B_SETTING",
            request=request,
            target_table="b2b_settings",
            details={"key": key, "new_value": value}
        )
        
        return {"key": result[0], "value": result[1]}
        
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# ============================================================================
# 6. B2B REVERSE FLOW ENDPOINTS (Purchases & Outgoing Payments)
# ============================================================================

# --- Purchase Models ---
class B2BPurchaseItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(..., gt=0)
    unit_cost: float = Field(..., gt=0)

class B2BPurchaseCreate(BaseModel):
    client_id: int
    items: List[B2BPurchaseItemCreate]
    reference_number: Optional[str] = None
    notes: Optional[str] = None
    purchase_date: Optional[datetime] = None

class B2BPurchaseOut(BaseModel):
    id: int
    client_id: int
    purchase_date: datetime
    total_amount: float
    status: str
    payment_status: str
    amount_paid: float
    reference_number: Optional[str]
    notes: Optional[str]
    items: List[B2BOrderItemOut] = [] # Reusing output model or create new if needed

class RecordPaymentOutRequest(BaseModel):
    client_id: int
    amount: float = Field(..., gt=0)
    payment_mode: str  # 'cash', 'upi', 'cheque', 'bank_transfer'
    payment_reference: Optional[str] = None
    notes: Optional[str] = None

@router.post("/purchases", response_model=B2BPurchaseOut)
def create_b2b_purchase(
    purchase: B2BPurchaseCreate,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Create a new B2B purchase (Receive Items).
    - Increases inventory (via trigger or manual update)
    - Creates ledger entry (PURCHASE - Credits Client / We owe them)
    - Updates client balance (Decreases balance)
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verify client
        cur.execute("SELECT id, name, current_balance FROM b2b_clients WHERE id = %s", (purchase.client_id,))
        client = cur.fetchone()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Calculate totals
        total_amount = 0
        for item in purchase.items:
             total_amount += (item.quantity * item.unit_cost)
             
        # Create Purchase Record
        cur.execute("""
            INSERT INTO b2b_purchases 
                (client_id, total_amount, reference_number, notes, purchase_date, created_by)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, purchase_date, total_amount, status, payment_status, amount_paid, 
                      reference_number, notes, created_at
        """, (
            purchase.client_id, total_amount, purchase.reference_number, 
            purchase.notes, purchase.purchase_date or datetime.now(), current_user.id
        ))
        p_row = cur.fetchone()
        purchase_id = p_row[0]
        
        # Insert Items
        for item in purchase.items:
            # Trigger 'trg_b2b_purchase_stock_update' will handle stock increase
            cur.execute("""
                INSERT INTO b2b_purchase_items (purchase_id, product_id, quantity, unit_cost, line_total)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                purchase_id, item.product_id, item.quantity, item.unit_cost, 
                (item.quantity * item.unit_cost)
            ))
            
        # Create Ledger Entry (PURCHASE)
        # PURCHASE type decreases client balance (Logic in update_client_balance trigger: balance = balance - amount)
        # Example: Balance 0. Purchase 1000. New Balance -1000 (We owe them 1000).
        cur.execute("""
            INSERT INTO b2b_transactions 
                (client_id, type, amount, running_balance, related_order_id, notes, created_by)
            VALUES (%s, 'PURCHASE', %s, 
                    (SELECT current_balance - %s FROM b2b_clients WHERE id = %s), 
                    NULL, %s, %s)
        """, (
            purchase.client_id, total_amount, total_amount, purchase.client_id, 
            f"Purchase Ref: {purchase.reference_number or 'N/A'}", current_user.id
        ))
        
        conn.commit()
        
        # Construct response
        return B2BPurchaseOut(
             id=purchase_id,
             client_id=purchase.client_id,
             purchase_date=p_row[1],
             total_amount=float(p_row[2]),
             status=p_row[3],
             payment_status=p_row[4],
             amount_paid=float(p_row[5]),
             reference_number=p_row[6],
             notes=p_row[7],
             items=[] # we can fetch items if needed, but for now returning empty list to save query
        )

    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@router.post("/payments/out", response_model=KhataTransactionOut)
def record_outgoing_payment(
    payment: RecordPaymentOutRequest,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Record an outgoing payment to a B2B client (Paying off our debt).
    - Increases client balance (Logic: balance = balance + amount)
    - Example: Balance -1000 (We owe). Pay 1000. New Balance 0.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Verify client
        cur.execute("SELECT id, name, current_balance FROM b2b_clients WHERE id = %s", (payment.client_id,))
        client = cur.fetchone()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        current_balance = float(client[2])
        new_balance = current_balance + payment.amount # Paying them reduces our debt (makes balance more positive)
        
        # Create Transaction
        cur.execute("""
            INSERT INTO b2b_transactions 
                (client_id, type, amount, running_balance, payment_mode, 
                 payment_reference, notes, created_by)
            VALUES (%s, 'PAYMENT_OUT', %s, %s, %s, %s, %s, %s)
            RETURNING id, type, amount, running_balance, related_order_id,
                      payment_mode, payment_reference, notes, created_at
        """, (
            payment.client_id, payment.amount, new_balance,
            payment.payment_mode, payment.payment_reference,
            payment.notes, current_user.id
        ))
        txn = cur.fetchone()
        
        conn.commit()
        
        return KhataTransactionOut(
            id=txn[0],
            type=txn[1],
            amount=float(txn[2]),
            running_balance=float(txn[3]),
            related_order_id=txn[4],
            payment_mode=txn[5],
            payment_reference=txn[6],
            notes=txn[7],
            created_at=txn[8],
            created_by_name=current_user.username
        )

    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
