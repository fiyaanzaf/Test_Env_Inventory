from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Annotated, List, Optional
from datetime import date, datetime, timedelta
from security import check_role, User, get_db_connection, create_audit_log
import psycopg2

router = APIRouter(
    prefix="/api/v1/purchases",
    tags=["Purchase Orders"]
)

# --- Models ---
class POItemCreate(BaseModel):
    product_id: int
    quantity: int
    unit_cost: float

class PurchaseOrderCreate(BaseModel):
    supplier_id: int
    expected_date: Optional[date] = None
    notes: Optional[str] = None
    items: List[POItemCreate]

class PurchaseOrderOut(BaseModel):
    id: int
    supplier_id: int        
    supplier_name: str
    status: str
    total_amount: float
    expected_date: Optional[date]
    created_at: datetime
    item_count: int

class ReceivePORequest(BaseModel):
    warehouse_id: int

class AddItemsRequest(BaseModel):
    items: List[POItemCreate]

# --- Endpoints ---

# 1. List All Purchase Orders (History) - WITH SEARCH
@router.get("/", response_model=List[PurchaseOrderOut])
def get_purchase_orders(
    current_user: Annotated[User, Depends(check_role("employee"))],
    status: Optional[str] = None,
    search: Optional[str] = None
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Base Query
        query = """
        SELECT 
            po.id, 
            po.supplier_id, 
            s.name as supplier_name, 
            po.status, 
            po.total_amount, 
            po.expected_date,
            po.created_at,
            COUNT(poi.id) as item_count
        FROM purchase_orders po
        JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN purchase_order_items poi ON po.id = poi.po_id
        WHERE 1=1
        """
        
        params = []
        
        # Filter by Status
        if status and status != 'all':
            query += " AND po.status = %s"
            params.append(status)
            
        # Filter by Search (Supplier Name or ID)
        if search:
            query += " AND (s.name ILIKE %s OR po.id::text ILIKE %s)"
            wildcard = f"%{search}%"
            params.extend([wildcard, wildcard])
            
        # Grouping and Sorting
        query += """
        GROUP BY po.id, po.supplier_id, s.name
        ORDER BY po.expected_date ASC NULLS LAST, po.created_at DESC
        """
        
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        
        return [
            PurchaseOrderOut(
                id=r[0], 
                supplier_id=r[1], 
                supplier_name=r[2], 
                status=r[3], 
                total_amount=float(r[4] or 0),
                expected_date=r[5], 
                created_at=r[6], 
                item_count=r[7]
            ) for r in rows
        ]
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()

# 2. Create Purchase Order (Smart Merge Logic) - All staff can create drafts
@router.post("/", response_model=dict)
def create_purchase_order(
    po_data: PurchaseOrderCreate,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # 1. Check for Existing Draft
        cur.execute("""
            SELECT id FROM purchase_orders 
            WHERE supplier_id = %s AND status = 'draft'
            LIMIT 1
        """, (po_data.supplier_id,))
        
        existing_draft = cur.fetchone()
        
        if existing_draft:
            # --- MERGE MODE ---
            po_id = existing_draft[0]
            action_type = "MERGE_PO"
            
            # Update Header (Optional: only if new data provided)
            if po_data.expected_date:
                cur.execute("UPDATE purchase_orders SET expected_date = %s WHERE id = %s", (po_data.expected_date, po_id))
            if po_data.notes:
                cur.execute("UPDATE purchase_orders SET notes = COALESCE(notes, '') || ' | ' || %s WHERE id = %s", (po_data.notes, po_id))
        else:
            # --- CREATE MODE ---
            action_type = "CREATE_PO"
            cur.execute("""
                INSERT INTO purchase_orders (supplier_id, status, total_amount, expected_date, notes, created_by)
                VALUES (%s, 'draft', 0, %s, %s, %s)
                RETURNING id
            """, (po_data.supplier_id, po_data.expected_date, po_data.notes, current_user.id))
            po_id = cur.fetchone()[0]

        # 2. Process Items (Insert or Update)
        for item in po_data.items:
            # Check for duplicate item in this PO
            cur.execute("""
                SELECT id, quantity_ordered FROM purchase_order_items 
                WHERE po_id = %s AND product_id = %s
            """, (po_id, item.product_id))
            existing_item = cur.fetchone()
            
            if existing_item:
                # Update Quantity
                new_qty = existing_item[1] + item.quantity
                cur.execute("""
                    UPDATE purchase_order_items 
                    SET quantity_ordered = %s, unit_cost = %s
                    WHERE id = %s
                """, (new_qty, item.unit_cost, existing_item[0]))
            else:
                # Insert New
                cur.execute("""
                    INSERT INTO purchase_order_items (po_id, product_id, quantity_ordered, unit_cost)
                    VALUES (%s, %s, %s, %s)
                """, (po_id, item.product_id, item.quantity, item.unit_cost))

        # 3. Recalculate Total
        cur.execute("""
            UPDATE purchase_orders 
            SET total_amount = (
                SELECT COALESCE(SUM(quantity_ordered * unit_cost), 0) 
                FROM purchase_order_items 
                WHERE po_id = %s
            )
            WHERE id = %s
        """, (po_id, po_id))
        
        # 4. Update Low Stock alerts to "Added to Order" for these products
        product_ids = [item.product_id for item in po_data.items]
        for product_id in product_ids:
            # Get product name for the alert
            cur.execute("SELECT name FROM products WHERE id = %s", (product_id,))
            product_row = cur.fetchone()
            if product_row:
                product_name = product_row[0]
                # Update existing Low Stock alert message to indicate it's been ordered
                # Also update created_at to reflect when product was added to order
                cur.execute("""
                    UPDATE system_alerts 
                    SET message = CONCAT('ADDED TO ORDER: ', %s, ' has been added to Purchase Order #', %s::text),
                        created_at = NOW()
                    WHERE message LIKE %s 
                    AND message LIKE '%%LOW STOCK%%'
                    AND status = 'active'
                """, (product_name, po_id, f"%'{product_name}'%"))
        
        create_audit_log(current_user, action_type, request, "purchase_orders", po_id, {"supplier": po_data.supplier_id})
        
        conn.commit()
        return {"status": "success", "po_id": po_id, "message": "Order processed successfully", "merged": bool(existing_draft)}
        
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()

# 3. Get PO Details
@router.get("/{po_id}")
def get_po_details(po_id: int, current_user: Annotated[User, Depends(check_role("employee"))]):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get Header
        cur.execute("""
            SELECT po.id, s.name, po.status, po.total_amount, po.created_at, po.notes, po.supplier_id, po.expected_date 
            FROM purchase_orders po
            JOIN suppliers s ON po.supplier_id = s.id
            WHERE po.id = %s
        """, (po_id,))
        header = cur.fetchone()
        if not header: raise HTTPException(404, "Order not found")
        
        # Get Items
        cur.execute("""
            SELECT p.name, p.sku, poi.quantity_ordered, poi.unit_cost, 
                   (poi.quantity_ordered * poi.unit_cost) as subtotal, 
                   poi.id, poi.product_id
            FROM purchase_order_items poi
            JOIN products p ON poi.product_id = p.id
            WHERE poi.po_id = %s
        """, (po_id,))
        items = cur.fetchall()
        
        return {
            "id": header[0], 
            "supplier": header[1], 
            "status": header[2], 
            "total": float(header[3]), 
            "date": header[4], 
            "notes": header[5],
            "supplier_id": header[6], 
            "expected_date": header[7],
            "items": [
                {
                    "name": i[0], 
                    "sku": i[1], 
                    "qty": i[2], 
                    "cost": float(i[3]), 
                    "subtotal": float(i[4]),
                    "id": i[5],
                    "product_id": i[6]
                } 
                for i in items
            ]
        }
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()

# 4. Update Status (Place Order / Cancel) - UPDATED: Auto-Delete Drafts
@router.put("/{po_id}/status")
def update_po_status(
    po_id: int, 
    status_update: dict, 
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    new_status = status_update.get("status")
    if new_status not in ['placed', 'cancelled', 'draft']:
        raise HTTPException(400, "Invalid status (use 'receive' endpoint for receiving)")
        
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check current status
        cur.execute("SELECT status FROM purchase_orders WHERE id = %s", (po_id,))
        res = cur.fetchone()
        if not res:
            raise HTTPException(404, "Order not found")
        current_status = res[0]
        
        # LOGIC FIX: If Cancelling a Draft -> DELETE it completely.
        if current_status == 'draft' and new_status == 'cancelled':
            cur.execute("DELETE FROM purchase_order_items WHERE po_id = %s", (po_id,))
            cur.execute("DELETE FROM purchase_orders WHERE id = %s", (po_id,))
            conn.commit()
            return {"status": "success", "message": "Draft order deleted"}
            
        # Standard Status Update
        cur.execute("UPDATE purchase_orders SET status = %s WHERE id = %s", (new_status, po_id))
        conn.commit()
        
        create_audit_log(current_user, "UPDATE_PO_STATUS", request, "purchase_orders", po_id, {"status": new_status})
        return {"status": "success", "message": f"Order marked as {new_status}"}
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()

# 5. Add Single Item to PO - All staff can add items to drafts
@router.post("/{po_id}/item")
def add_single_item_to_po(
    po_id: int,
    item: POItemCreate,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    return add_items_to_order(po_id, AddItemsRequest(items=[item]), request, current_user)

# 6. Add Multiple Items to PO (Supports 'Add to Draft' feature) - All staff can add
@router.post("/{po_id}/items")
def add_items_to_order(
    po_id: int, 
    payload: AddItemsRequest,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # 1. Verify Order Exists and is Draft
        cur.execute("SELECT status FROM purchase_orders WHERE id = %s", (po_id,))
        order = cur.fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if order[0] != 'draft':
            raise HTTPException(status_code=400, detail="Can only add items to draft orders")

        # 2. Insert Items
        for item in payload.items:
            # Check if item exists in this PO already
            cur.execute("""
                SELECT id, quantity_ordered, unit_cost FROM purchase_order_items 
                WHERE po_id = %s AND product_id = %s
            """, (po_id, item.product_id))
            existing = cur.fetchone()

            if existing:
                # Update quantity if exists
                new_qty = existing[1] + item.quantity
                cur.execute("""
                    UPDATE purchase_order_items 
                    SET quantity_ordered = %s, unit_cost = %s 
                    WHERE id = %s
                """, (new_qty, item.unit_cost, existing[0]))
            else:
                # Insert new line item
                cur.execute("""
                    INSERT INTO purchase_order_items (po_id, product_id, quantity_ordered, unit_cost)
                    VALUES (%s, %s, %s, %s)
                """, (po_id, item.product_id, item.quantity, item.unit_cost))
        
        # 3. Update Total Amount of the Order
        cur.execute("""
            UPDATE purchase_orders 
            SET total_amount = (
                SELECT COALESCE(SUM(quantity_ordered * unit_cost), 0) 
                FROM purchase_order_items 
                WHERE po_id = %s
            )
            WHERE id = %s
        """, (po_id, po_id))

        create_audit_log(current_user, "PO_ADD_ITEMS", request, "purchase_orders", po_id, {"count": len(payload.items)})
        
        conn.commit()
        return {"status": "success", "message": "Items added successfully"}

    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# 7. Receive PO (Convert to Inventory)
@router.post("/{po_id}/receive")
def receive_purchase_order(
    po_id: int,
    request_body: ReceivePORequest,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # 1. Validate PO Status
        cur.execute("SELECT status FROM purchase_orders WHERE id = %s", (po_id,))
        po = cur.fetchone()
        if not po: raise HTTPException(404, "Order not found")
        if po[0] != 'placed': raise HTTPException(400, "Order must be 'placed' before receiving.")

        # 2. Validate Warehouse Location
        cur.execute("SELECT location_type FROM locations WHERE id = %s", (request_body.warehouse_id,))
        loc = cur.fetchone()
        if not loc: raise HTTPException(404, "Location not found")
        if loc[0] != 'warehouse': 
            raise HTTPException(400, "Stock from Purchase Orders must be received into a WAREHOUSE.")

        # 3. Get Order Items
        cur.execute("""
            SELECT product_id, SUM(quantity_ordered), AVG(unit_cost) 
            FROM purchase_order_items 
            WHERE po_id = %s 
            GROUP BY product_id
        """, (po_id,))
        items = cur.fetchall()

        if not items: raise HTTPException(400, "Order has no items.")

        # 4. Create Inventory Batches
        batch_code = f"PO-{po_id}-{date.today().strftime('%Y%m%d')}"
        default_expiry = date.today() + timedelta(days=365) 

        for product_id, qty, cost in items:
            cur.execute("""
                INSERT INTO inventory_batches 
                (product_id, location_id, batch_code, quantity, expiry_date, unit_cost, received_at)
                VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            """, (product_id, request_body.warehouse_id, batch_code, qty, default_expiry, cost))

        # 5. Update PO Status
        cur.execute("UPDATE purchase_orders SET status = 'received' WHERE id = %s", (po_id,))

        # 6. Resolve "Added to Order" alerts for products in this order
        cur.execute("""
            UPDATE system_alerts 
            SET status = 'resolved', is_resolved = TRUE
            WHERE message LIKE %s 
            AND message LIKE '%%ADDED TO ORDER%%'
            AND status = 'active'
        """, (f"%Purchase Order #{po_id}%",))

        # 7. Audit Log
        create_audit_log(
            current_user, 
            "RECEIVE_PO", 
            request, 
            "purchase_orders", 
            po_id, 
            {"warehouse_id": request_body.warehouse_id, "batch_code": batch_code}
        )

        conn.commit()
        return {"status": "success", "message": f"Order received into Warehouse ID {request_body.warehouse_id}"}

    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()

# 8. Remove Item from PO
@router.delete("/{po_id}/items/{item_id}")
def remove_item_from_po(
    po_id: int,
    item_id: int,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # 1. Validate PO Status
        cur.execute("SELECT status FROM purchase_orders WHERE id = %s", (po_id,))
        res = cur.fetchone()
        if not res: raise HTTPException(404, "Order not found")
        if res[0] != 'draft': raise HTTPException(400, "Can only remove items from DRAFT orders.")

        # 2. Get Item Cost/Qty
        cur.execute("SELECT quantity_ordered, unit_cost FROM purchase_order_items WHERE id = %s AND po_id = %s", (item_id, po_id))
        item = cur.fetchone()
        if not item: raise HTTPException(404, "Item not found in this order")
        
        deduct_amount = item[0] * item[1]

        # 3. Delete Item
        cur.execute("DELETE FROM purchase_order_items WHERE id = %s", (item_id,))
        
        # 4. Update Header Total
        cur.execute("UPDATE purchase_orders SET total_amount = total_amount - %s WHERE id = %s", (deduct_amount, po_id))
        
        create_audit_log(current_user, "PO_REMOVE_ITEM", request, "purchase_orders", po_id, {"item_id": item_id})
        
        conn.commit()
        return {"status": "success", "message": "Item removed"}
        
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()

# 9. Check for Active Draft - All staff can check
@router.get("/suppliers/{supplier_id}/active-draft")
def check_active_draft(
    supplier_id: int, 
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id 
            FROM purchase_orders 
            WHERE supplier_id = %s AND status = 'draft'
            ORDER BY created_at DESC 
            LIMIT 1
        """, (supplier_id,))
        
        row = cur.fetchone()
        
        return {
            "draft_order_id": row[0] if row else None,
            "exists": True if row else False
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()