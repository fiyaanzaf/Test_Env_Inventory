from fastapi import APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from typing import Annotated, List, Optional
import os
from dotenv import load_dotenv
from datetime import datetime
import io
import base64
from reportlab.lib.pagesizes import letter, A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

# HTML to PDF conversion
from xhtml2pdf import pisa
from jinja2 import Environment, FileSystemLoader
import pathlib

from security import get_current_user, check_role, User, get_db_connection, create_audit_log

# Optional: QR code support
try:
    import qrcode
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

router = APIRouter(
    prefix="/api/v1/sales",
    tags=["Sales"]
)

load_dotenv()
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

# Setup Jinja2 template environment
TEMPLATES_DIR = pathlib.Path(__file__).resolve().parent.parent / "templates"
print(f"[DEBUG] TEMPLATES_DIR: {TEMPLATES_DIR}, exists: {TEMPLATES_DIR.exists()}")
jinja_env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))


# ============================================================================
# HELPER FUNCTIONS FOR INVOICE TEMPLATES
# ============================================================================

def number_to_words(num):
    """Convert number to Indian currency words."""
    ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
            'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
            'Seventeen', 'Eighteen', 'Nineteen']
    tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
    
    def convert_chunk(n):
        if n < 20:
            return ones[n]
        elif n < 100:
            return tens[n // 10] + ((' ' + ones[n % 10]) if n % 10 else '')
        else:
            return ones[n // 100] + ' Hundred' + ((' and ' + convert_chunk(n % 100)) if n % 100 else '')
    
    if num == 0:
        return 'Zero Rupees Only'
    
    rupees = int(num)
    paise = int(round((num - rupees) * 100))
    
    # Indian numbering system
    result = []
    
    if rupees >= 10000000:  # Crore
        result.append(convert_chunk(rupees // 10000000) + ' Crore')
        rupees %= 10000000
    
    if rupees >= 100000:  # Lakh
        result.append(convert_chunk(rupees // 100000) + ' Lakh')
        rupees %= 100000
    
    if rupees >= 1000:  # Thousand
        result.append(convert_chunk(rupees // 1000) + ' Thousand')
        rupees %= 1000
    
    if rupees > 0:
        result.append(convert_chunk(rupees))
    
    text = ' '.join(result) + ' Rupees'
    
    if paise:
        text += ' and ' + convert_chunk(paise) + ' Paise'
    
    return text + ' Only'


def hex_to_color(hex_str):
    """Convert hex color to reportlab color."""
    hex_str = hex_str.lstrip('#')
    r = int(hex_str[0:2], 16) / 255
    g = int(hex_str[2:4], 16) / 255
    b = int(hex_str[4:6], 16) / 255
    return colors.Color(r, g, b)


def generate_upi_qr_bytes(upi_link):
    """Generate QR code bytes for UPI link."""
    if not HAS_QRCODE:
        return None
    try:
        qr = qrcode.QRCode(version=1, box_size=5, border=1)
        qr.add_data(upi_link)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Save to BytesIO
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='PNG')
        img_buffer.seek(0)
        return img_buffer.getvalue()
    except Exception as e:
        print(f"QR Gen Error: {e}")
        return None


def get_business_settings_dict(cur):
    """Get business settings as dictionary."""
    cur.execute("SELECT key, value FROM business_settings;")
    rows = cur.fetchall()
    return {row[0]: row[1] for row in rows} if rows else {}


def add_signature_section(elements, settings, width, primary_color):
    """Add signature section with optional image."""
    if settings.get('show_signature') not in ['true', True, '1']:
        return
    
    sig_name = settings.get('signature_name', 'Authorized Signatory')
    sig_image = settings.get('signature_image', '')
    
    # Create signature box
    sig_content = []
    
    if sig_image and sig_image.startswith('data:image'):
        # Decode base64 image
        try:
            import base64
            # Extract base64 data
            header, data = sig_image.split(',', 1)
            img_bytes = base64.b64decode(data)
            img_buffer = io.BytesIO(img_bytes)
            sig_img = Image(img_buffer, width=60, height=30)
            sig_content.append([sig_img])
        except:
            sig_content.append([Paragraph('', ParagraphStyle('Empty', fontSize=30))])
    else:
        # Empty space for manual signature
        sig_content.append([Paragraph('<br/><br/>', ParagraphStyle('Empty', fontSize=12))])
    
    sig_content.append([Paragraph(f"<b>{sig_name}</b>", 
                                  ParagraphStyle('SigName', fontSize=9, alignment=TA_CENTER))])
    sig_content.append([Paragraph('Authorized Signatory', 
                                  ParagraphStyle('SigTitle', fontSize=8, alignment=TA_CENTER, textColor=colors.grey))])
    
    sig_table = Table(sig_content, colWidths=[width*0.35])
    sig_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    









# --- Models ---

class SalesOrderItemIn(BaseModel):
    product_id: int
    quantity: int
    unit_price: float 

class SalesOrderIn(BaseModel):
    customer_name: str | None = None
    customer_email: EmailStr | None = None
    customer_phone: str | None = None 
    sales_channel: str # 'in-store', 'online'
    items: List[SalesOrderItemIn]
    payment_method: str = "cash"  # Defaults to cash - options: cash, upi, card, credit (khata)
    payment_reference: str | None = None # e.g., "UPI-123456"
    khata_customer_id: int | None = None  # Required when payment_method = "credit"

class SalesOrderItemOut(BaseModel):
    product_id: int
    sku: str
    product_name: str
    quantity: int
    unit_price: str 
    unit_cost: Optional[str] = None 

class SalesOrderHeader(BaseModel):
    id: int
    order_timestamp: datetime
    customer_name: Optional[str]
    total_amount: str
    sales_channel: str
    status: str
    fulfillment_method: str
    payment_method: str | None = None 
    payment_reference: str | None = None
    customer_phone: str | None = None

class SalesOrderDetails(SalesOrderHeader):
    customer_email: Optional[EmailStr]
    customer_phone: Optional[str]
    user_id: Optional[int]
    external_order_id: Optional[str]
    items: List[SalesOrderItemOut]

class PaginatedSalesResponse(BaseModel):
    items: List[SalesOrderHeader]
    total: int
    page: int
    total_pages: int

# --- Endpoints ---

# 1. Get MY Orders (Customer - Only if logged in)
@router.get("/orders/me", response_model=List[SalesOrderHeader])
def get_my_sales_orders(
    current_user: Annotated[User, Depends(check_role("customer"))]
):
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, order_timestamp, customer_name, total_amount, sales_channel, status, fulfillment_method, payment_method, payment_reference
            FROM sales_orders
            WHERE user_id = %s
            ORDER BY order_timestamp DESC;
            """,
            (current_user.id,)
        )
        orders = cur.fetchall()
        cur.close()
        
        orders_list = []
        for order in orders:
            orders_list.append(SalesOrderHeader(
                id=order[0],
                order_timestamp=order[1],
                customer_name=order[2],
                total_amount=str(order[3]),
                sales_channel=order[4],
                status=order[5],
                fulfillment_method=order[6] or "POS",
                payment_method=order[7],
                payment_reference=order[8]
            ))
        return orders_list
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# 2. Create a New Sales Order (Auto-FIFO Logic with Profit Tracking)
@router.post("/orders", response_model=SalesOrderHeader)
def create_sales_order(
    order: SalesOrderIn,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)] 
):
    # --- PERMISSION CHECK ---
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized to create sales orders")

    # --- INPUT VALIDATION ---
    if not order.items:
        raise HTTPException(status_code=400, detail="Order must contain at least one item.")
    
    for item in order.items:
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail=f"Quantity must be positive. Got: {item.quantity}")
        if item.unit_price < 0:
            raise HTTPException(status_code=400, detail=f"Price cannot be negative. Got: {item.unit_price}")

    conn = None
    try:
        # --- Auto-Calculate Total ---
        calculated_total = 0.0
        for item in order.items:
            calculated_total += (item.quantity * item.unit_price)
        final_total_amount = round(calculated_total, 2)

        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        
        # === KHATA (CREDIT) PAYMENT VALIDATION ===
        khata_customer_data = None
        if order.payment_method == "credit":
            if not order.khata_customer_id:
                raise HTTPException(
                    status_code=400, 
                    detail="Khata customer ID is required for credit payments"
                )
            
            # Check if customer exists and is not blocked
            cur.execute("""
                SELECT id, name, phone, current_balance, credit_limit, is_blocked, is_active
                FROM khata_customers 
                WHERE id = %s;
            """, (order.khata_customer_id,))
            
            khata_customer_data = cur.fetchone()
            if not khata_customer_data:
                raise HTTPException(status_code=404, detail="Khata customer not found")
            
            kc_id, kc_name, kc_phone, kc_balance, kc_limit, kc_blocked, kc_active = khata_customer_data
            
            if not kc_active:
                raise HTTPException(status_code=400, detail=f"Khata customer '{kc_name}' is inactive")
            
            if kc_blocked:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Customer '{kc_name}' is blocked due to exceeding credit limit"
                )
            
            # Check if this purchase would exceed credit limit
            available_credit = float(kc_limit) - float(kc_balance)
            if final_total_amount > available_credit:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Insufficient credit. Available: ₹{available_credit:.2f}, Required: ₹{final_total_amount:.2f}"
                )
            
            # Set customer info from khata
            if not order.customer_name:
                order.customer_name = kc_name
            if not order.customer_phone:
                order.customer_phone = kc_phone
        # === END KHATA VALIDATION ===
        
        user_id_for_db = None
        final_customer_name = order.customer_name
        final_customer_email = order.customer_email
        
        # --- Channel Logic ---
        if order.sales_channel == 'in-store':
            if not any(role in current_user.roles for role in ALLOWED_ROLES):
                 raise HTTPException(status_code=403, detail="Unauthorized sales channel.")
            
            if order.customer_phone:
                cur.execute("SELECT id, username, email FROM users WHERE phone_number = %s", (order.customer_phone,))
                loyalty_member = cur.fetchone()
                if loyalty_member:
                    user_id_for_db = loyalty_member[0]
                    if not final_customer_name: final_customer_name = loyalty_member[1]
                    if not final_customer_email: final_customer_email = loyalty_member[2]
            
            if not final_customer_name: final_customer_name = "Walk-in Customer"
        else:
             user_id_for_db = None

        # --- Create Receipt ---
        cur.execute(
            """
            INSERT INTO sales_orders (
                customer_name, customer_email, customer_phone, total_amount, 
                sales_channel, status, user_id, fulfillment_method,
                payment_method, payment_reference
            )
            VALUES (%s, %s, %s, %s, %s, 'completed', %s, 'POS', %s, %s)
            RETURNING id, order_timestamp, customer_name, total_amount, sales_channel, status, fulfillment_method, payment_method, payment_reference, customer_phone;
            """,
            (
                final_customer_name, 
                final_customer_email, 
                order.customer_phone, 
                final_total_amount, 
                order.sales_channel, 
                user_id_for_db,
                order.payment_method,
                order.payment_reference
            )
        )
        new_order_header = cur.fetchone()
        new_order_id = new_order_header[0]
        
        # --- Process Items (Auto-FIFO: Shelf First, Then Warehouse) ---
        
        for item in order.items:
            quantity_to_fulfill = item.quantity
            
            # 1. Capture Current Cost (For Profit Reports)
            cur.execute("SELECT average_cost, name, low_stock_threshold, shelf_restock_threshold FROM products WHERE id = %s", (item.product_id,))
            cost_res = cur.fetchone()
            current_unit_cost = float(cost_res[0]) if cost_res and cost_res[0] is not None else 0.0
            product_name = cost_res[1] if cost_res else f"Product {item.product_id}"
            LOW_STOCK_THRESHOLD = cost_res[2] if cost_res else 20
            SHELF_RESTOCK_THRESHOLD = cost_res[3] if cost_res else 5

            # 2. Find available stock from SHELF (store locations) first
            sql_find_shelf_stock = """
            SELECT b.id, b.quantity, l.name, l.location_type
            FROM inventory_batches b
            JOIN locations l ON b.location_id = l.id
            LEFT JOIN batch_tracking bt ON b.tracking_batch_id = bt.id
            WHERE 
                b.product_id = %s 
                AND b.quantity > 0
                AND l.location_type = 'store' 
            ORDER BY 
                CASE COALESCE(bt.batch_tag, 'normal')
                    WHEN 'clearance' THEN 1
                    WHEN 'priority' THEN 2
                    WHEN 'promotional' THEN 3
                    ELSE 4
                END,
                b.expiry_date ASC NULLS LAST, 
                b.received_at ASC
            FOR UPDATE OF b;
            """
            cur.execute(sql_find_shelf_stock, (item.product_id,))
            shelf_batches = cur.fetchall()
            
            # 3. Find available stock from WAREHOUSE
            sql_find_warehouse_stock = """
            SELECT b.id, b.quantity, l.name, l.location_type
            FROM inventory_batches b
            JOIN locations l ON b.location_id = l.id
            LEFT JOIN batch_tracking bt ON b.tracking_batch_id = bt.id
            WHERE 
                b.product_id = %s 
                AND b.quantity > 0
                AND l.location_type = 'warehouse' 
            ORDER BY 
                CASE COALESCE(bt.batch_tag, 'normal')
                    WHEN 'clearance' THEN 1
                    WHEN 'priority' THEN 2
                    WHEN 'promotional' THEN 3
                    ELSE 4
                END,
                b.expiry_date ASC NULLS LAST, 
                b.received_at ASC
            FOR UPDATE OF b;
            """
            cur.execute(sql_find_warehouse_stock, (item.product_id,))
            warehouse_batches = cur.fetchall()
            
            # Combine: Shelf first, then Warehouse
            all_batches = list(shelf_batches) + list(warehouse_batches)
            total_available = sum(b[1] for b in all_batches)
            total_shelf_stock = sum(b[1] for b in shelf_batches)
            
            # 4. Block sale only if TOTAL stock is insufficient
            if total_available < quantity_to_fulfill:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Not enough stock for '{product_name}'. Requested: {quantity_to_fulfill}, Available (Total): {total_available}"
                )

            # 5. Deduct from batches (Shelf first, then Warehouse)
            for batch in all_batches:
                if quantity_to_fulfill == 0:
                    break
                
                batch_id, batch_quantity, loc_name, loc_type = batch
                take_qty = min(batch_quantity, quantity_to_fulfill)
                
                # Add Line Item
                cur.execute(
                    "INSERT INTO sales_order_items (order_id, product_id, quantity, unit_price, unit_cost) VALUES (%s, %s, %s, %s, %s);",
                    (new_order_id, item.product_id, take_qty, item.unit_price, current_unit_cost)
                )
                
                # Update Batch
                cur.execute(
                    "UPDATE inventory_batches SET quantity = quantity - %s WHERE id = %s RETURNING quantity",
                    (take_qty, batch_id)
                )
                updated_qty = cur.fetchone()[0]
                
                quantity_to_fulfill -= take_qty
                
                # Log if batch emptied
                if updated_qty == 0:
                    create_audit_log(
                        user=current_user,
                        action="BATCH_EMPTIED",
                        request=request,
                        target_table="inventory_batches",
                        target_id=batch_id,
                        details={"message": f"Batch empty at {loc_name} ({loc_type})", "product_id": item.product_id}
                    )
            
            # 6. Check stock levels and create INDEPENDENT alerts
            
            # Get current shelf stock
            cur.execute("""
                SELECT COALESCE(SUM(b.quantity), 0) 
                FROM inventory_batches b 
                JOIN locations l ON b.location_id = l.id 
                WHERE b.product_id = %s AND l.location_type = 'store'
            """, (item.product_id,))
            remaining_shelf_stock = cur.fetchone()[0] or 0
            
            # Get warehouse stock
            cur.execute("""
                SELECT COALESCE(SUM(b.quantity), 0) 
                FROM inventory_batches b 
                JOIN locations l ON b.location_id = l.id 
                WHERE b.product_id = %s AND l.location_type = 'warehouse'
            """, (item.product_id,))
            warehouse_stock = cur.fetchone()[0] or 0
            
            total_stock = remaining_shelf_stock + warehouse_stock
            
            # INDEPENDENT CHECK 1: SHELF RESTOCK (shelf < 5)
            if remaining_shelf_stock < SHELF_RESTOCK_THRESHOLD:
                cur.execute("""
                    SELECT id FROM system_alerts 
                    WHERE message LIKE %s AND is_resolved = FALSE
                """, (f"%SHELF RESTOCK NEEDED: '{product_name}'%",))
                
                if not cur.fetchone():
                    cur.execute("""
                        INSERT INTO system_alerts (severity, message, created_at, is_resolved, status)
                        VALUES ('warning', %s, NOW(), FALSE, 'active')
                    """, (f"SHELF RESTOCK NEEDED: '{product_name}' has only {remaining_shelf_stock} units on shelf. (Warehouse has {warehouse_stock} units)",))
            
            # INDEPENDENT CHECK 2: LOW STOCK (total < 20)
            if total_stock < LOW_STOCK_THRESHOLD:
                cur.execute("""
                    SELECT id FROM system_alerts 
                    WHERE message LIKE %s AND is_resolved = FALSE
                """, (f"%LOW STOCK: '{product_name}'%",))
                
                if not cur.fetchone():
                    cur.execute("""
                        INSERT INTO system_alerts (severity, message, created_at, is_resolved, status)
                        VALUES ('critical', %s, NOW(), FALSE, 'active')
                    """, (f"LOW STOCK: '{product_name}' has only {total_stock} units total. ORDER FROM SUPPLIER needed.",))
            
            # Audit log
            if remaining_shelf_stock < SHELF_RESTOCK_THRESHOLD or total_stock < LOW_STOCK_THRESHOLD:
                create_audit_log(
                    user=current_user,
                    action="STOCK_ALERT_TRIGGERED",
                    request=request,
                    target_table="products",
                    target_id=item.product_id,
                    details={
                        "product_name": product_name,
                        "shelf_stock": remaining_shelf_stock,
                        "warehouse_stock": warehouse_stock,
                        "total_stock": total_stock,
                        "shelf_alert": remaining_shelf_stock < SHELF_RESTOCK_THRESHOLD,
                        "low_stock_alert": total_stock < LOW_STOCK_THRESHOLD
                    }
                )

        # === RECORD KHATA TRANSACTION (if credit payment) ===
        if order.payment_method == "credit" and khata_customer_data:
            kc_id, kc_name, kc_phone, kc_balance, kc_limit, kc_blocked, kc_active = khata_customer_data
            new_balance = float(kc_balance) + final_total_amount
            
            # Insert khata transaction (the trigger will update balance)
            cur.execute("""
                INSERT INTO khata_transactions (
                    customer_id, type, amount, running_balance,
                    sales_order_id, notes, created_by, created_by_name
                )
                VALUES (%s, 'CREDIT_SALE', %s, %s, %s, %s, %s, %s);
            """, (
                kc_id, 
                final_total_amount, 
                new_balance,
                new_order_id,
                f"Credit sale - Order #{new_order_id}",
                current_user.id,
                current_user.username
            ))
            
            # Check if customer should be blocked after this purchase
            if new_balance >= float(kc_limit):
                cur.execute("""
                    UPDATE khata_customers 
                    SET is_blocked = TRUE, 
                        block_reason = 'Credit limit exceeded',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s;
                """, (kc_id,))
        # === END KHATA TRANSACTION ===

        conn.commit()
        cur.close()
        
        return SalesOrderHeader(
            id=new_order_header[0],
            order_timestamp=new_order_header[1],
            customer_name=new_order_header[2],
            total_amount=str(new_order_header[3]),
            sales_channel=new_order_header[4],
            status=new_order_header[5],
            fulfillment_method=new_order_header[6] or "POS",
            payment_method=new_order_header[7],
            payment_reference=new_order_header[8],
            customer_phone=new_order_header[9]
        )
        
    except HTTPException:
        if conn: conn.rollback()
        raise
    except Exception as e:
        if conn: conn.rollback()
        if "403" in str(e): raise HTTPException(status_code=403, detail="Unauthorized.")
        if "Not enough stock" in str(e): raise HTTPException(status_code=400, detail=str(e))
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    finally:
        if conn: conn.close()

# 3. Get All Sales Orders (UPDATED: Fixed Pagination Logic)
@router.get("/orders", response_model=PaginatedSalesResponse)
def get_all_sales_orders(
    current_user: Annotated[User, Depends(get_current_user)],
    search: Optional[str] = None,
    status: Optional[str] = None,
    payment_method: Optional[str] = None, 
    page: int = 1,
    limit: int = 50,
    sort_by: str = "date",
    sort_order: str = "desc"
):
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized to view sales history")

    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        
        # 1. Build Base Query
        query_base = " FROM sales_orders WHERE 1=1"
        params = []

        if status and status.lower() != 'all':
            query_base += " AND status = %s"
            params.append(status)

        if payment_method and payment_method.lower() != 'all':
            query_base += " AND payment_method = %s"
            params.append(payment_method)

        if search:
            query_base += " AND (customer_name ILIKE %s OR id::text ILIKE %s OR customer_phone ILIKE %s)"
            wildcard_search = f"%{search}%"
            params.extend([wildcard_search, wildcard_search, wildcard_search])

        # 2. Get Total Count
        cur.execute(f"SELECT COUNT(*) {query_base}", tuple(params))
        total_records = cur.fetchone()[0]

        # 3. Sorting
        sort_map = {
            "date": "order_timestamp",
            "amount": "total_amount",
            "customer": "LOWER(customer_name)",
            "payment": "payment_method",
            "id": "id"
        }
        db_sort_col = sort_map.get(sort_by, "order_timestamp")
        query_base += f" ORDER BY {db_sort_col} {sort_order.upper()}, order_timestamp DESC"

        # 4. Pagination
        offset = (page - 1) * limit
        query_final = f"""
            SELECT id, order_timestamp, customer_name, total_amount, sales_channel, status, fulfillment_method, payment_method, payment_reference, customer_phone
            {query_base}
            LIMIT %s OFFSET %s
        """
        params.extend([limit, offset])
        
        cur.execute(query_final, tuple(params))
        orders = cur.fetchall()
        cur.close()
        
        orders_list = []
        for order in orders:
            orders_list.append(SalesOrderHeader(
                id=order[0],
                order_timestamp=order[1],
                customer_name=order[2] or "Walk-in Customer",
                total_amount=str(order[3]),
                sales_channel=order[4],
                status=order[5],
                fulfillment_method=order[6] or "POS",
                payment_method=order[7] or "N/A",
                payment_reference=order[8],
                customer_phone=order[9]
            ))
        
        # 5. Calculate Total Pages (FIXED)
        total_pages = (total_records + limit - 1) // limit

        return PaginatedSalesResponse(
            items=orders_list,
            total=total_records,
            page=page,
            total_pages=total_pages
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# 4. Export Sales List PDF
@router.get("/export_pdf")
def export_sales_pdf(
    current_user: Annotated[User, Depends(get_current_user)],
    search: Optional[str] = None,
    payment_method: Optional[str] = None,
    sort_by: str = "date",
    sort_order: str = "desc"
):
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")

    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        query = "SELECT id, order_timestamp, customer_name, total_amount, payment_method FROM sales_orders WHERE 1=1"
        params = []
        
        if search:
            query += " AND (customer_name ILIKE %s OR id::text ILIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])

        if payment_method and payment_method.lower() != 'all':
            query += " AND payment_method = %s"
            params.append(payment_method)

        sort_map = {
            "date": "order_timestamp", 
            "payment": "payment_method", 
            "amount": "total_amount", 
            "customer": "LOWER(customer_name)",
            "id": "id"
        }
        col = sort_map.get(sort_by, "order_timestamp")
        query += f" ORDER BY {col} {sort_order.upper()}, order_timestamp DESC"
        
        cur.execute(query, tuple(params))
        rows = cur.fetchall()

        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        w, h = letter
        
        # Register Unicode font for rupee symbol support
        font_regular = 'Helvetica'
        font_bold = 'Helvetica-Bold'
        rupee = 'Rs.'  # Default fallback
        
        # Try to register a Unicode font from Windows system fonts
        try:
            import os.path
            # Try common Windows fonts that support ₹
            font_paths = [
                ('C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/arialbd.ttf'),
                ('C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/segoeuib.ttf'),
                ('C:/Windows/Fonts/calibri.ttf', 'C:/Windows/Fonts/calibrib.ttf'),
            ]
            for regular_path, bold_path in font_paths:
                if os.path.exists(regular_path) and os.path.exists(bold_path):
                    pdfmetrics.registerFont(TTFont('UniFont', regular_path))
                    pdfmetrics.registerFont(TTFont('UniFont-Bold', bold_path))
                    font_regular = 'UniFont'
                    font_bold = 'UniFont-Bold'
                    rupee = '₹'
                    break
        except Exception as e:
            print(f"Could not register Unicode font: {e}")
        
        p.setFont(font_bold, 16)
        p.drawString(50, h - 50, f"Sales Report (Generated: {datetime.now().strftime('%Y-%m-%d')})")
        
        y = h - 100
        p.setFont(font_bold, 10)
        p.drawString(40, y, "ID")
        p.drawString(100, y, "Date")
        p.drawString(240, y, "Customer")
        p.drawString(400, y, "Method")
        p.drawString(500, y, "Amount")
        p.line(40, y-5, 550, y-5)
        
        y -= 25
        p.setFont(font_regular, 10)
        
        total_sales = 0.0
        
        for row in rows:
            if y < 50: 
                p.showPage()
                y = h - 50
                p.setFont(font_regular, 10)
            
            p.drawString(40, y, str(row[0]))
            p.drawString(100, y, str(row[1])[:16])
            p.drawString(240, y, str(row[2] or "Guest")[:25])
            p.drawString(400, y, str(row[4] or "Cash"))
            p.drawString(500, y, f"{rupee}{float(row[3]):.2f}")
            
            total_sales += float(row[3])
            y -= 20

        p.line(40, y+10, 550, y+10)
        p.setFont(font_bold, 12)
        p.drawString(400, y-10, "Total Sales:")
        p.drawString(500, y-10, f"{rupee}{total_sales:.2f}")

        p.save()
        buffer.seek(0)
        
        return StreamingResponse(
            buffer, 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=sales_report.pdf"}
        )
    finally:
        conn.close()

# 5. Export SINGLE Order Receipt PDF with Template Selection


# 6. Get Single Order Details
@router.get("/orders/{order_id}", response_model=SalesOrderDetails)
def get_sales_order_by_id(
    order_id: int,
    current_user: Annotated[User, Depends(get_current_user)]
):
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, order_timestamp, customer_name, customer_email, total_amount, sales_channel, status, user_id, customer_phone, external_order_id, fulfillment_method, payment_method, payment_reference
            FROM sales_orders WHERE id = %s
            """,
            (order_id,)
        )
        order_header = cur.fetchone()
        
        if not order_header:
            raise HTTPException(status_code=404, detail="Order not found")
        
        order_user_id = order_header[7]
        
        ALLOWED_ROLES = ["owner", "manager", "employee"]
        is_staff = any(role in current_user.roles for role in ALLOWED_ROLES)
        
        if not is_staff and order_user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view this order")
        
        cur.execute(
            """
            SELECT i.product_id, p.sku, p.name as product_name,
                   SUM(i.quantity) as quantity, i.unit_price,
                   CASE WHEN SUM(i.quantity) > 0
                        THEN SUM(i.unit_cost * i.quantity) / SUM(i.quantity)
                        ELSE 0 END as unit_cost
            FROM sales_order_items i
            JOIN products p ON i.product_id = p.id
            WHERE i.order_id = %s
            GROUP BY i.product_id, p.sku, p.name, i.unit_price
            ORDER BY p.name;
            """,
            (order_id,)
        )
        items = cur.fetchall()
        cur.close()
        
        items_list = []
        for item in items:
            items_list.append(SalesOrderItemOut(
                product_id=item[0],
                sku=item[1],
                product_name=item[2],
                quantity=item[3],
                unit_price=str(item[4]),
                unit_cost=str(item[5]) if item[5] else None
            ))
        
        return SalesOrderDetails(
            id=order_header[0],
            order_timestamp=order_header[1],
            customer_name=order_header[2],
            customer_email=order_header[3],
            total_amount=str(order_header[4]),
            sales_channel=order_header[5],
            status=order_header[6],
            user_id=order_user_id,
            customer_phone=order_header[8],
            external_order_id=order_header[9],
            fulfillment_method=order_header[10] or "POS",
            payment_method=order_header[11],
            payment_reference=order_header[12],
            items=items_list
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()