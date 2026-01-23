from fastapi import APIRouter, HTTPException, Depends, Request, status
from pydantic import BaseModel
from typing import Annotated, List, Optional
import psycopg2
import os
from dotenv import load_dotenv
from datetime import date, datetime, timedelta
import uuid

# --- Security & Utils ---
from security import check_role, User, get_db_connection, get_current_user, create_audit_log, create_operation_log

router = APIRouter(
    prefix="/api/v1/inventory",
    tags=["Inventory"]
)

# --- Load Environment Variables ---
load_dotenv()

# ==========================================
# Data Models
# ==========================================

# 1. NEW: Location Model for Dropdowns
class Location(BaseModel):
    id: int
    name: str
    type: str  # 'warehouse' or 'store'

class BatchReceive(BaseModel):
    product_id: int
    location_id: int
    batch_code: Optional[str] = None # Will generate UUID if None
    quantity: int
    expiry_date: Optional[date] = None
    unit_cost: float # <--- UPDATED: Was cost_price

class BatchWriteOff(BaseModel):
    batch_id: int
    quantity_to_remove: int
    reason: str

# 2. UPDATED: Transfer Model (batch_code is Optional for FIFO)
class StockTransfer(BaseModel):
    product_id: int
    from_location_id: int
    to_location_id: int
    quantity: int
    batch_code: Optional[str] = None # If None, uses FIFO logic

# Response Models
class BatchInfo(BaseModel):
    id: int
    location_id: int
    location_name: str
    location_type: str  
    batch_code: str
    quantity: int
    expiry_date: Optional[date]
    received_at: datetime

class ProductStockInfo(BaseModel):
    product_id: int
    product_name: str
    sku: str
    total_quantity: int
    batches: List[BatchInfo]

class WriteOffEvent(BaseModel):
    id: int
    product_name: str
    sku: str
    location_name: str
    batch_code: str
    quantity_removed: int
    reason: str
    write_off_date: datetime
    performed_by: str

class BulkItem(BaseModel):
    product_id: int
    quantity: int
    unit_cost: Optional[float] = 0.0 # <--- UPDATED: Was cost_price

class BulkReceiveRequest(BaseModel):
    location_id: int
    items: List[BulkItem]

class BulkTransferRequest(BaseModel):
    from_location_id: int
    to_location_id: int
    items: List[BulkItem]

# ==========================================
# Endpoints
# ==========================================

# --- 1. NEW: Get Locations (For Dropdowns) ---
@router.get("/locations", response_model=List[Location])
def get_locations(current_user: Annotated[User, Depends(check_role("employee"))]):
    """Fetch all active locations for dropdowns (Ordered by Type)."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, name, location_type FROM locations ORDER BY location_type DESC, name ASC")
        rows = cur.fetchall()
        cur.close()
        
        return [Location(id=r[0], name=r[1], type=r[2]) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# --- 2. Receive Stock (Inbound) ---
@router.post("/receive", response_model=BatchInfo)
def receive_stock_batch(
    batch: BatchReceive,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    """
    Manager only: Receive new stock into a location (usually Warehouse).
    """
    conn = None
    # Generate batch code if missing
    effective_batch_code = batch.batch_code if batch.batch_code else f"BATCH-{str(uuid.uuid4())[:8].upper()}"
    
    # Default expiry if missing (1 year)
    effective_expiry = batch.expiry_date if batch.expiry_date else (datetime.now() + timedelta(days=365)).date()

    # UPDATED SQL: Using unit_cost
    sql = """
    INSERT INTO inventory_batches (product_id, location_id, batch_code, quantity, expiry_date, unit_cost, received_at)
    VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
    ON CONFLICT (product_id, location_id, batch_code)
    DO UPDATE SET 
        quantity = inventory_batches.quantity + EXCLUDED.quantity,
        unit_cost = EXCLUDED.unit_cost,
        received_at = CURRENT_TIMESTAMP
    RETURNING id, product_id, location_id, batch_code, quantity, expiry_date, received_at;
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute(sql, (
            batch.product_id,
            batch.location_id,
            effective_batch_code,
            batch.quantity,
            effective_expiry,
            batch.unit_cost # <--- Using updated field
        ))
        
        new_batch = cur.fetchone()
        conn.commit()
        
        # Fetch location details
        cur.execute("SELECT name, location_type FROM locations WHERE id = %s", (new_batch[2],))
        loc_data = cur.fetchone()
        location_name = loc_data[0]
        location_type = loc_data[1]
        
        # Audit Log (API access tracking)
        create_audit_log(
            user=current_user,
            action="RECEIVE_STOCK",
            request=request,
            target_table="inventory_batches",
            target_id=new_batch[0],
            details={
                "product_id": new_batch[1],
                "location_id": new_batch[2],
                "batch_code": new_batch[3],
                "added_qty": batch.quantity,
                "new_total_qty": new_batch[4],
                "unit_cost": batch.unit_cost
            }
        )
        
        # Operations Log (business operation record)
        # Get product name for readable log
        cur.execute("SELECT name FROM products WHERE id = %s", (new_batch[1],))
        product_name_row = cur.fetchone()
        product_name_log = product_name_row[0] if product_name_row else f"Product {new_batch[1]}"
        
        create_operation_log(
            user=current_user,
            operation_type="receive",
            request=request,
            target_id=new_batch[0],
            quantity=batch.quantity,
            reason=f"{product_name_log} received at {location_name}",
            details={"batch_code": new_batch[3], "product_id": new_batch[1], "location": location_name}
        )
        
        # ALERT RESOLUTION: Check if alerts should be resolved after receiving stock
        product_id = new_batch[1]
        SHELF_RESTOCK_THRESHOLD = 5
        LOW_STOCK_THRESHOLD = 20
        
        # Get product name
        cur.execute("SELECT name FROM products WHERE id = %s", (product_id,))
        product_result = cur.fetchone()
        product_name = product_result[0] if product_result else None
        
        if product_name:
            # Get current shelf stock
            cur.execute("""
                SELECT COALESCE(SUM(b.quantity), 0) 
                FROM inventory_batches b 
                JOIN locations l ON b.location_id = l.id 
                WHERE b.product_id = %s AND l.location_type = 'store'
            """, (product_id,))
            shelf_stock = cur.fetchone()[0] or 0
            
            # Get total stock
            cur.execute("""
                SELECT COALESCE(SUM(b.quantity), 0) 
                FROM inventory_batches b 
                WHERE b.product_id = %s
            """, (product_id,))
            total_stock = cur.fetchone()[0] or 0
            
            # RESOLVE SHELF RESTOCK if shelf >= threshold
            if shelf_stock >= SHELF_RESTOCK_THRESHOLD:
                cur.execute("""
                    UPDATE system_alerts 
                    SET is_resolved = TRUE, status = 'resolved'
                    WHERE message LIKE %s AND is_resolved = FALSE
                """, (f"%SHELF RESTOCK NEEDED: '{product_name}'%",))
                if cur.rowcount > 0:
                    print(f"[RECEIVE] Auto-resolved SHELF RESTOCK alert for '{product_name}'")
            
            # RESOLVE LOW STOCK if total >= threshold
            if total_stock >= LOW_STOCK_THRESHOLD:
                cur.execute("""
                    UPDATE system_alerts 
                    SET is_resolved = TRUE, status = 'resolved'
                    WHERE message LIKE %s AND is_resolved = FALSE
                """, (f"%LOW STOCK: '{product_name}'%",))
                if cur.rowcount > 0:
                    print(f"[RECEIVE] Auto-resolved LOW STOCK alert for '{product_name}'")
            
            conn.commit()
        
        cur.close()
        
        return BatchInfo(
            id=new_batch[0],
            location_id=new_batch[2],
            location_name=location_name,
            location_type=location_type, 
            batch_code=new_batch[3],
            quantity=new_batch[4],
            expiry_date=new_batch[5],
            received_at=new_batch[6]
        )
    except Exception as e:
        if conn: conn.rollback()
        if "foreign key constraint" in str(e):
            raise HTTPException(status_code=400, detail="Invalid product_id or location_id.")
        if "check constraint" in str(e):
            raise HTTPException(status_code=400, detail="Quantity cannot be negative.")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# --- 3. Get Stock Details ---
@router.get("/product/{product_id}", response_model=ProductStockInfo)
def get_product_stock_batches(
    product_id: int,
    current_user: Annotated[User, Depends(get_current_user)] 
):
    """
    View all batches for a specific product across all locations.
    """
    conn = None
    sql = """
    SELECT 
        b.id, b.location_id, l.name as location_name, l.location_type,
        b.batch_code, b.quantity, b.expiry_date, b.received_at,
        p.name as product_name, p.sku
    FROM inventory_batches b
    JOIN locations l ON b.location_id = l.id
    JOIN products p ON b.product_id = p.id
    WHERE b.product_id = %s AND b.quantity > 0
    ORDER BY b.expiry_date ASC NULLS LAST, b.received_at ASC;
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(sql, (product_id,))
        batches = cur.fetchall()
        cur.close()
        
        if not batches:
            cur = conn.cursor()
            cur.execute("SELECT name, sku FROM products WHERE id = %s", (product_id,))
            product_info = cur.fetchone()
            cur.close()
            if not product_info:
                raise HTTPException(status_code=404, detail="Product not found")
            return ProductStockInfo(
                product_id=product_id,
                product_name=product_info[0],
                sku=product_info[1],
                total_quantity=0,
                batches=[]
            )
            
        batch_list = []
        total_quantity = 0
        for batch in batches:
            batch_list.append(BatchInfo(
                id=batch[0],
                location_id=batch[1],
                location_name=batch[2],
                location_type=batch[3], 
                batch_code=batch[4],
                quantity=batch[5],
                expiry_date=batch[6],
                received_at=batch[7]
            ))
            total_quantity += batch[5]
            
        return ProductStockInfo(
            product_id=product_id,
            product_name=batches[0][8],
            sku=batches[0][9],          
            total_quantity=total_quantity,
            batches=batch_list
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

    
# --- 4. Write-off Stock ---
@router.post("/write_off", response_model=BatchInfo)
def write_off_stock(
    write_off: BatchWriteOff,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    """
    Remove damaged or expired stock.
    """
    conn = None
    sql = """
    UPDATE inventory_batches
    SET quantity = quantity - %s
    WHERE id = %s
    RETURNING id, product_id, location_id, batch_code, quantity, expiry_date, received_at;
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(sql, (write_off.quantity_to_remove, write_off.batch_id))
        updated_batch = cur.fetchone()
        
        if updated_batch is None:
            raise HTTPException(status_code=404, detail="Inventory batch not found.")
        
        conn.commit()
        
        cur.execute("SELECT name, location_type FROM locations WHERE id = %s", (updated_batch[2],))
        loc_data = cur.fetchone()
        location_name = loc_data[0]
        location_type = loc_data[1]
        
        # Use new operations_log instead of audit_log for write-offs
        create_operation_log(
            user=current_user,
            operation_type="write_off",
            request=request,
            target_id=updated_batch[0],
            quantity=write_off.quantity_to_remove,
            reason=write_off.reason,
            details={"batch_code": updated_batch[3], "product_id": updated_batch[1]}
        )
        
        # INDEPENDENT ALERT CHECKS after write-off
        product_id = updated_batch[1]
        SHELF_RESTOCK_THRESHOLD = 5
        LOW_STOCK_THRESHOLD = 20
        
        # Get product name
        cur.execute("SELECT name FROM products WHERE id = %s", (product_id,))
        product_result = cur.fetchone()
        product_name = product_result[0] if product_result else f"Product {product_id}"
        
        # Get current shelf stock
        cur.execute("""
            SELECT COALESCE(SUM(b.quantity), 0) 
            FROM inventory_batches b 
            JOIN locations l ON b.location_id = l.id 
            WHERE b.product_id = %s AND l.location_type = 'store'
        """, (product_id,))
        shelf_stock = cur.fetchone()[0] or 0
        
        # Get warehouse stock
        cur.execute("""
            SELECT COALESCE(SUM(b.quantity), 0) 
            FROM inventory_batches b 
            JOIN locations l ON b.location_id = l.id 
            WHERE b.product_id = %s AND l.location_type = 'warehouse'
        """, (product_id,))
        warehouse_stock = cur.fetchone()[0] or 0
        
        total_stock = shelf_stock + warehouse_stock
        
        # INDEPENDENT CHECK 1: SHELF RESTOCK (shelf < 5)
        if shelf_stock < SHELF_RESTOCK_THRESHOLD:
            cur.execute("""
                SELECT id FROM system_alerts 
                WHERE message LIKE %s AND is_resolved = FALSE
            """, (f"%SHELF RESTOCK NEEDED: '{product_name}'%",))
            
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO system_alerts (severity, message, created_at, is_resolved, status)
                    VALUES ('warning', %s, NOW(), FALSE, 'active')
                """, (f"SHELF RESTOCK NEEDED: '{product_name}' has only {shelf_stock} units on shelf. (Warehouse has {warehouse_stock} units)",))
        
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
        
        conn.commit()
        
        cur.close()
        
        return BatchInfo(
            id=updated_batch[0],
            location_id=updated_batch[2],
            location_name=location_name,
            location_type=location_type, 
            batch_code=updated_batch[3],
            quantity=updated_batch[4],
            expiry_date=updated_batch[5],
            received_at=updated_batch[6]
        )
    except Exception as e:
        if conn: conn.rollback()
        if "check constraint" in str(e):
            raise HTTPException(status_code=400, detail="Cannot write off more stock than exists.")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# --- 5. UPDATED: Transfer Stock (Smart FIFO) ---
@router.post("/transfer")
def transfer_stock_fifo(
    transfer: StockTransfer,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Moves stock from Source -> Dest.
    """
    conn = None
    if transfer.from_location_id == transfer.to_location_id:
        raise HTTPException(status_code=400, detail="Source and destination cannot be the same.")

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # 1. Determine which batches to move
        batches_to_move = []
        
        if transfer.batch_code:
            # A. Specific Batch Request (UPDATED: Select unit_cost)
            cur.execute("""
                SELECT id, quantity, batch_code, unit_cost, expiry_date 
                FROM inventory_batches 
                WHERE product_id = %s AND location_id = %s AND batch_code = %s AND quantity > 0
            """, (transfer.product_id, transfer.from_location_id, transfer.batch_code))
            b = cur.fetchone()
            if not b: raise HTTPException(404, "Batch not found")
            if b[1] < transfer.quantity: raise HTTPException(400, f"Not enough stock in batch. Available: {b[1]}")
            batches_to_move.append(b)
        else:
            # B. FIFO Automatic Request (UPDATED: Select unit_cost)
            cur.execute("""
                SELECT id, quantity, batch_code, unit_cost, expiry_date 
                FROM inventory_batches 
                WHERE product_id = %s AND location_id = %s AND quantity > 0
                ORDER BY expiry_date ASC NULLS LAST, received_at ASC
            """, (transfer.product_id, transfer.from_location_id))
            available_batches = cur.fetchall()

            total_avail = sum(b[1] for b in available_batches)
            if total_avail < transfer.quantity:
                raise HTTPException(400, f"Not enough total stock. Available: {total_avail}")

            qty_needed = transfer.quantity
            for b in available_batches:
                if qty_needed <= 0: break
                batches_to_move.append(b)
                qty_needed -= b[1]

        # 2. Execute Transfer Loop
        remaining_qty = transfer.quantity
        
        for batch in batches_to_move:
            if remaining_qty <= 0: break

            b_id, b_qty, b_code, b_cost, b_expiry = batch
            
            deduct = min(remaining_qty, b_qty)

            # A. Deduct from Source
            cur.execute("UPDATE inventory_batches SET quantity = quantity - %s WHERE id = %s", (deduct, b_id))

            # B. Add to Destination (UPDATED: Insert unit_cost)
            cur.execute("""
                INSERT INTO inventory_batches 
                (product_id, location_id, batch_code, quantity, expiry_date, unit_cost, received_at)
                VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (product_id, location_id, batch_code)
                DO UPDATE SET 
                    quantity = inventory_batches.quantity + EXCLUDED.quantity,
                    received_at = CURRENT_TIMESTAMP
            """, (transfer.product_id, transfer.to_location_id, b_code, deduct, b_expiry, b_cost))

            remaining_qty -= deduct

            create_audit_log(
                user=current_user,
                action="STOCK_TRANSFER",
                request=request,
                target_table="inventory_batches",
                target_id=b_id,
                details={
                    "product_id": transfer.product_id,
                    "batch": b_code,
                    "qty_moved": deduct,
                    "from": transfer.from_location_id,
                    "to": transfer.to_location_id,
                    "unit_cost": b_cost
                }
            )

        # Operations Log: Log the overall transfer operation
        cur.execute("SELECT name FROM products WHERE id = %s", (transfer.product_id,))
        prod_row = cur.fetchone()
        product_name_log = prod_row[0] if prod_row else f"Product {transfer.product_id}"
        
        cur.execute("SELECT name FROM locations WHERE id = %s", (transfer.from_location_id,))
        from_loc = cur.fetchone()
        from_loc_name = from_loc[0] if from_loc else "Unknown"
        
        cur.execute("SELECT name FROM locations WHERE id = %s", (transfer.to_location_id,))
        to_loc = cur.fetchone()
        to_loc_name = to_loc[0] if to_loc else "Unknown"
        
        create_operation_log(
            user=current_user,
            operation_type="transfer",
            request=request,
            target_id=transfer.product_id,
            quantity=transfer.quantity,
            reason=f"{product_name_log}: {from_loc_name} → {to_loc_name}",
            details={"from": from_loc_name, "to": to_loc_name}
        )

        # 3. INSTANT ALERT RESOLUTION: Check if transfer resolves any alerts
        SHELF_RESTOCK_THRESHOLD = 5
        LOW_STOCK_THRESHOLD = 20
        
        # Get product name for alert matching
        cur.execute("SELECT name FROM products WHERE id = %s", (transfer.product_id,))
        product_result = cur.fetchone()
        product_name = product_result[0] if product_result else None
        
        if product_name:
            # Get current shelf stock
            cur.execute("""
                SELECT COALESCE(SUM(b.quantity), 0)
                FROM inventory_batches b
                INNER JOIN locations l ON b.location_id = l.id
                WHERE b.product_id = %s AND l.location_type = 'store'
            """, (transfer.product_id,))
            current_shelf_stock = cur.fetchone()[0] or 0
            
            # Get total stock
            cur.execute("""
                SELECT COALESCE(SUM(b.quantity), 0)
                FROM inventory_batches b
                WHERE b.product_id = %s
            """, (transfer.product_id,))
            total_stock = cur.fetchone()[0] or 0
            
            # RESOLVE SHELF RESTOCK if shelf >= threshold
            if current_shelf_stock >= SHELF_RESTOCK_THRESHOLD:
                cur.execute("""
                    UPDATE system_alerts 
                    SET is_resolved = TRUE, status = 'resolved'
                    WHERE message LIKE %s AND is_resolved = FALSE
                """, (f"%SHELF RESTOCK NEEDED: '{product_name}'%",))
                if cur.rowcount > 0:
                    print(f"[TRANSFER] Auto-resolved SHELF RESTOCK alert for '{product_name}'")
            
            # RESOLVE LOW STOCK if total >= threshold
            if total_stock >= LOW_STOCK_THRESHOLD:
                cur.execute("""
                    UPDATE system_alerts 
                    SET is_resolved = TRUE, status = 'resolved'
                    WHERE message LIKE %s AND is_resolved = FALSE
                """, (f"%LOW STOCK: '{product_name}'%",))
                if cur.rowcount > 0:
                    print(f"[TRANSFER] Auto-resolved LOW STOCK alert for '{product_name}'")

        conn.commit()
        return {"status": "success", "message": f"Successfully transferred {transfer.quantity} units."}

    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

@router.get("/write_off_history", response_model=List[WriteOffEvent])
def get_write_off_history(
    current_user: Annotated[User, Depends(check_role("manager"))],
    limit: int = 50
):
    """
    Returns a historical list of all stock write-offs.
    """
    conn = None
    sql = """
    SELECT 
        ol.id,
        p.name as product_name,
        p.sku,
        l.name as location_name,
        ib.batch_code,
        ol.quantity as quantity_removed,
        ol.reason,
        ol.created_at as write_off_date,
        ol.username as performed_by
    FROM operations_log ol
    JOIN inventory_batches ib ON ol.target_id = ib.id
    JOIN products p ON ib.product_id = p.id
    JOIN locations l ON ib.location_id = l.id
    WHERE ol.operation_type = 'write_off'
    ORDER BY ol.created_at DESC
    LIMIT %s;
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(sql, (limit,))
        rows = cur.fetchall()
        cur.close()

        history = []
        for r in rows:
            history.append(WriteOffEvent(
                id=r[0],
                product_name=r[1],
                sku=r[2],
                location_name=r[3],
                batch_code=r[4],
                quantity_removed=r[5],
                reason=r[6],
                write_off_date=r[7],
                performed_by=r[8]
            ))
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

@router.post("/bulk/receive")
def bulk_receive_stock(
    req: BulkReceiveRequest,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Default expiry (1 year from now)
        expiry = (datetime.now() + timedelta(days=365)).date()

        for item in req.items:
            batch_code = f"BATCH-{str(uuid.uuid4())[:8].upper()}"
            # UPDATED: Insert unit_cost
            cur.execute("""
                INSERT INTO inventory_batches (product_id, location_id, batch_code, quantity, expiry_date, unit_cost, received_at)
                VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                RETURNING id
            """, (item.product_id, req.location_id, batch_code, item.quantity, expiry, item.unit_cost))
            
            batch_id = cur.fetchone()[0]
            
            create_audit_log(
                user=current_user,
                action="BULK_RECEIVE",
                request=request,
                target_table="inventory_batches",
                target_id=batch_id,
                details={"product_id": item.product_id, "qty": item.quantity, "location": req.location_id, "unit_cost": item.unit_cost}
            )
            
            # Operations Log: Atomized record for each product
            cur.execute("SELECT name FROM products WHERE id = %s", (item.product_id,))
            prod_row = cur.fetchone()
            product_name_log = prod_row[0] if prod_row else f"Product {item.product_id}"
            
            cur.execute("SELECT name FROM locations WHERE id = %s", (req.location_id,))
            loc_row = cur.fetchone()
            loc_name = loc_row[0] if loc_row else "Unknown"
            
            create_operation_log(
                user=current_user,
                operation_type="bulk_receive",
                request=request,
                target_id=batch_id,
                quantity=item.quantity,
                reason=f"{product_name_log} received at {loc_name}",
                details={"batch_code": batch_code, "product_id": item.product_id, "location": loc_name}
            )

        conn.commit()
        return {"status": "success", "message": f"Received {len(req.items)} products"}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()

@router.post("/bulk/transfer")
def bulk_transfer_stock(
    req: BulkTransferRequest,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    if req.from_location_id == req.to_location_id:
        raise HTTPException(400, "Source and Destination cannot be the same")

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Track product IDs for instant alert resolution
        transferred_product_ids = []

        for item in req.items:
            # FIFO Logic: Find oldest stock (UPDATED: Select unit_cost)
            cur.execute("""
                SELECT id, quantity, batch_code, unit_cost, expiry_date 
                FROM inventory_batches 
                WHERE product_id = %s AND location_id = %s AND quantity > 0
                ORDER BY expiry_date ASC NULLS LAST, received_at ASC
                FOR UPDATE
            """, (item.product_id, req.from_location_id))
            
            available_batches = cur.fetchall()
            total_avail = sum(b[1] for b in available_batches)
            
            if total_avail < item.quantity:
                raise HTTPException(400, f"Not enough stock for Product ID {item.product_id}. Need {item.quantity}, Have {total_avail}")

            qty_needed = item.quantity
            
            for b in available_batches:
                if qty_needed <= 0: break
                b_id, b_qty, b_code, b_cost, b_expiry = b
                
                deduct = min(qty_needed, b_qty)
                
                # 1. Deduct from Source
                cur.execute("UPDATE inventory_batches SET quantity = quantity - %s WHERE id = %s", (deduct, b_id))
                
                # 2. Add to Destination (UPDATED: Insert unit_cost)
                cur.execute("""
                    INSERT INTO inventory_batches (product_id, location_id, batch_code, quantity, expiry_date, unit_cost, received_at)
                    VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (product_id, location_id, batch_code)
                    DO UPDATE SET quantity = inventory_batches.quantity + EXCLUDED.quantity
                """, (item.product_id, req.to_location_id, b_code, deduct, b_expiry, b_cost))
                
                qty_needed -= deduct

            create_audit_log(
                user=current_user,
                action="BULK_TRANSFER",
                request=request,
                details={"product_id": item.product_id, "qty": item.quantity, "from": req.from_location_id, "to": req.to_location_id}
            )
            
            # Operations Log: Atomized record for each product transfer
            cur.execute("SELECT name FROM products WHERE id = %s", (item.product_id,))
            prod_row = cur.fetchone()
            product_name_log = prod_row[0] if prod_row else f"Product {item.product_id}"
            
            cur.execute("SELECT name FROM locations WHERE id = %s", (req.from_location_id,))
            from_loc_row = cur.fetchone()
            from_loc_name = from_loc_row[0] if from_loc_row else "Unknown"
            
            cur.execute("SELECT name FROM locations WHERE id = %s", (req.to_location_id,))
            to_loc_row = cur.fetchone()
            to_loc_name = to_loc_row[0] if to_loc_row else "Unknown"
            
            create_operation_log(
                user=current_user,
                operation_type="bulk_transfer",
                request=request,
                target_id=item.product_id,
                quantity=item.quantity,
                reason=f"{product_name_log}: {from_loc_name} → {to_loc_name}",
                details={"from": from_loc_name, "to": to_loc_name}
            )
            
            # Track this product for alert resolution
            transferred_product_ids.append(item.product_id)

        # INSTANT ALERT RESOLUTION for bulk transfers
        SHELF_RESTOCK_THRESHOLD = 5
        LOW_STOCK_THRESHOLD = 20
        
        for product_id in set(transferred_product_ids):  # Use set to avoid duplicates
            # Get product name
            cur.execute("SELECT name FROM products WHERE id = %s", (product_id,))
            product_result = cur.fetchone()
            product_name = product_result[0] if product_result else None
            
            if product_name:
                # Get current shelf stock
                cur.execute("""
                    SELECT COALESCE(SUM(b.quantity), 0)
                    FROM inventory_batches b
                    INNER JOIN locations l ON b.location_id = l.id
                    WHERE b.product_id = %s AND l.location_type = 'store'
                """, (product_id,))
                current_shelf_stock = cur.fetchone()[0] or 0
                
                # Get total stock
                cur.execute("""
                    SELECT COALESCE(SUM(b.quantity), 0)
                    FROM inventory_batches b
                    WHERE b.product_id = %s
                """, (product_id,))
                total_stock = cur.fetchone()[0] or 0
                
                # RESOLVE SHELF RESTOCK if shelf >= threshold
                if current_shelf_stock >= SHELF_RESTOCK_THRESHOLD:
                    cur.execute("""
                        UPDATE system_alerts 
                        SET is_resolved = TRUE, status = 'resolved'
                        WHERE message LIKE %s AND is_resolved = FALSE
                    """, (f"%SHELF RESTOCK NEEDED: '{product_name}'%",))
                    if cur.rowcount > 0:
                        print(f"[BULK TRANSFER] Auto-resolved SHELF RESTOCK alert for '{product_name}'")
                
                # RESOLVE LOW STOCK if total >= threshold
                if total_stock >= LOW_STOCK_THRESHOLD:
                    cur.execute("""
                        UPDATE system_alerts 
                        SET is_resolved = TRUE, status = 'resolved'
                        WHERE message LIKE %s AND is_resolved = FALSE
                    """, (f"%LOW STOCK: '{product_name}'%",))
                    if cur.rowcount > 0:
                        print(f"[BULK TRANSFER] Auto-resolved LOW STOCK alert for '{product_name}'")

        conn.commit()
        return {"status": "success", "message": "Bulk transfer complete"}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()