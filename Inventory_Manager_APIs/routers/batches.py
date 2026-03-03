from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Annotated, List, Optional
from datetime import date, datetime
from security import check_role, User, get_db_connection, create_audit_log
import io
import uuid

router = APIRouter(
    prefix="/api/v1/batches",
    tags=["Batch Tracking"]
)


# --- Pydantic Models ---

class BatchTrackingCreate(BaseModel):
    product_id: int
    variant_id: Optional[int] = None
    supplier_id: Optional[int] = None
    manufacturing_date: Optional[date] = None
    expiry_date: Optional[date] = None
    procurement_price: Optional[float] = None
    state_of_origin: Optional[str] = None   # Auto-filled from supplier if not provided
    batch_description: Optional[str] = None
    po_id: Optional[int] = None


class BatchTrackingOut(BaseModel):
    id: int
    batch_code: str
    product_id: int
    variant_id: Optional[int] = None
    variant_name: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    manufacturing_date: Optional[date] = None
    expiry_date: Optional[date] = None
    procurement_price: Optional[float] = None
    state_of_origin: Optional[str] = None
    batch_description: Optional[str] = None
    po_id: Optional[int] = None
    created_at: datetime
    created_by: Optional[str] = None
    stock_quantity: int = 0


class BatchBreakdownVariant(BaseModel):
    variant_id: Optional[int] = None
    variant_name: str
    batches: List[BatchTrackingOut]
    total_quantity: int = 0


class BatchBreakdownResponse(BaseModel):
    product_id: int
    product_name: str
    total_batches: int
    total_quantity: int
    variants: List[BatchBreakdownVariant]


class BatchTrackingUpdate(BaseModel):
    manufacturing_date: Optional[date] = None
    expiry_date: Optional[date] = None
    procurement_price: Optional[float] = None
    state_of_origin: Optional[str] = None
    batch_description: Optional[str] = None
    variant_id: Optional[int] = None


# --- Helper: Generate unique batch code ---
def generate_batch_code(product_id: int, po_id: Optional[int] = None) -> str:
    short_uuid = str(uuid.uuid4())[:8].upper()
    prefix = f"PO{po_id}" if po_id else "MAN"
    return f"BT-{prefix}-P{product_id}-{short_uuid}"


# --- Endpoints ---

# 1. Create a Batch Tracking Entry
@router.post("/", response_model=BatchTrackingOut)
def create_batch_tracking(
    batch_data: BatchTrackingCreate,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Verify product exists
        cur.execute("SELECT id, name FROM products WHERE id = %s", (batch_data.product_id,))
        product = cur.fetchone()
        if not product:
            raise HTTPException(404, "Product not found")

        # Verify variant if provided
        variant_name = None
        if batch_data.variant_id:
            cur.execute(
                "SELECT id, variant_name FROM product_variants WHERE id = %s AND product_id = %s",
                (batch_data.variant_id, batch_data.product_id)
            )
            variant = cur.fetchone()
            if not variant:
                raise HTTPException(400, "Variant not found or doesn't belong to this product")
            variant_name = variant[1]

        # Auto-fetch state_of_origin from supplier.location if not provided
        state_of_origin = batch_data.state_of_origin
        supplier_name = None
        if batch_data.supplier_id:
            cur.execute("SELECT name, location FROM suppliers WHERE id = %s", (batch_data.supplier_id,))
            supplier = cur.fetchone()
            if supplier:
                supplier_name = supplier[0]
                if not state_of_origin and supplier[1]:
                    state_of_origin = supplier[1]

        # Generate unique batch code
        batch_code = generate_batch_code(batch_data.product_id, batch_data.po_id)

        cur.execute("""
            INSERT INTO batch_tracking
            (batch_code, product_id, variant_id, supplier_id, manufacturing_date,
             expiry_date, procurement_price, state_of_origin, batch_description,
             po_id, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, batch_code, product_id, variant_id, supplier_id,
                      manufacturing_date, expiry_date, procurement_price,
                      state_of_origin, batch_description, po_id, created_at, created_by;
        """, (
            batch_code, batch_data.product_id, batch_data.variant_id,
            batch_data.supplier_id, batch_data.manufacturing_date,
            batch_data.expiry_date, batch_data.procurement_price,
            state_of_origin, batch_data.batch_description,
            batch_data.po_id, current_user.username
        ))

        row = cur.fetchone()

        create_audit_log(
            user=current_user, action="CREATE_BATCH_TRACKING", request=request,
            target_table="batch_tracking", target_id=row[0],
            details={"batch_code": batch_code, "product_id": batch_data.product_id}
        )

        conn.commit()
        cur.close()

        return BatchTrackingOut(
            id=row[0], batch_code=row[1], product_id=row[2],
            variant_id=row[3], variant_name=variant_name,
            supplier_id=row[4], supplier_name=supplier_name,
            manufacturing_date=row[5], expiry_date=row[6],
            procurement_price=float(row[7]) if row[7] else None,
            state_of_origin=row[8], batch_description=row[9],
            po_id=row[10], created_at=row[11], created_by=row[12],
            stock_quantity=0
        )
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 2. Get Batch Breakdown for a Product (grouped by variant)
@router.get("/product/{product_id}", response_model=BatchBreakdownResponse)
def get_batch_breakdown(
    product_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Get product
        cur.execute("SELECT id, name FROM products WHERE id = %s", (product_id,))
        product = cur.fetchone()
        if not product:
            raise HTTPException(404, "Product not found")

        # Get all batch tracking entries with stock info
        cur.execute("""
            SELECT 
                bt.id, bt.batch_code, bt.product_id, bt.variant_id,
                pv.variant_name,
                bt.supplier_id, s.name as supplier_name,
                bt.manufacturing_date, bt.expiry_date,
                bt.procurement_price, bt.state_of_origin,
                bt.batch_description, bt.po_id,
                bt.created_at, bt.created_by,
                COALESCE(SUM(ib.quantity), 0) as stock_quantity
            FROM batch_tracking bt
            LEFT JOIN product_variants pv ON bt.variant_id = pv.id
            LEFT JOIN suppliers s ON bt.supplier_id = s.id
            LEFT JOIN inventory_batches ib ON ib.tracking_batch_id = bt.id AND ib.quantity > 0
            WHERE bt.product_id = %s
            GROUP BY bt.id, pv.variant_name, s.name
            ORDER BY bt.variant_id NULLS FIRST, bt.created_at DESC;
        """, (product_id,))

        rows = cur.fetchall()
        cur.close()

        # Group by variant
        variant_groups = {}
        for r in rows:
            variant_id = r[3]
            variant_name = r[4] or "Base Product (No Variant)"
            key = variant_id if variant_id else 0

            if key not in variant_groups:
                variant_groups[key] = {
                    "variant_id": variant_id,
                    "variant_name": variant_name,
                    "batches": [],
                    "total_quantity": 0
                }

            batch = BatchTrackingOut(
                id=r[0], batch_code=r[1], product_id=r[2],
                variant_id=r[3], variant_name=r[4],
                supplier_id=r[5], supplier_name=r[6],
                manufacturing_date=r[7], expiry_date=r[8],
                procurement_price=float(r[9]) if r[9] else None,
                state_of_origin=r[10], batch_description=r[11],
                po_id=r[12], created_at=r[13], created_by=r[14],
                stock_quantity=int(r[15])
            )
            variant_groups[key]["batches"].append(batch)
            variant_groups[key]["total_quantity"] += int(r[15])

        variants = [
            BatchBreakdownVariant(**v) for v in variant_groups.values()
        ]

        total_batches = len(rows)
        total_quantity = sum(v.total_quantity for v in variants)

        return BatchBreakdownResponse(
            product_id=product_id,
            product_name=product[1],
            total_batches=total_batches,
            total_quantity=total_quantity,
            variants=variants
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 3. Get Single Batch Details
@router.get("/{batch_id}", response_model=BatchTrackingOut)
def get_batch_details(
    batch_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT 
                bt.id, bt.batch_code, bt.product_id, bt.variant_id,
                pv.variant_name,
                bt.supplier_id, s.name as supplier_name,
                bt.manufacturing_date, bt.expiry_date,
                bt.procurement_price, bt.state_of_origin,
                bt.batch_description, bt.po_id,
                bt.created_at, bt.created_by,
                COALESCE(SUM(ib.quantity), 0) as stock_quantity
            FROM batch_tracking bt
            LEFT JOIN product_variants pv ON bt.variant_id = pv.id
            LEFT JOIN suppliers s ON bt.supplier_id = s.id
            LEFT JOIN inventory_batches ib ON ib.tracking_batch_id = bt.id AND ib.quantity > 0
            WHERE bt.id = %s
            GROUP BY bt.id, pv.variant_name, s.name;
        """, (batch_id,))

        r = cur.fetchone()
        cur.close()

        if not r:
            raise HTTPException(404, "Batch not found")

        return BatchTrackingOut(
            id=r[0], batch_code=r[1], product_id=r[2],
            variant_id=r[3], variant_name=r[4],
            supplier_id=r[5], supplier_name=r[6],
            manufacturing_date=r[7], expiry_date=r[8],
            procurement_price=float(r[9]) if r[9] else None,
            state_of_origin=r[10], batch_description=r[11],
            po_id=r[12], created_at=r[13], created_by=r[14],
            stock_quantity=int(r[15])
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 4. Get Barcode Image for a Batch
@router.get("/{batch_id}/barcode")
def get_batch_barcode(
    batch_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT id, batch_code FROM batch_tracking WHERE id = %s", (batch_id,))
        row = cur.fetchone()
        cur.close()

        if not row:
            raise HTTPException(404, "Batch not found")

        # Generate barcode using python-barcode
        import barcode
        from barcode.writer import ImageWriter

        code128 = barcode.get_barcode_class('code128')
        barcode_value = f"BT-{row[0]}"

        # Generate to BytesIO
        buffer = io.BytesIO()
        bc = code128(barcode_value, writer=ImageWriter())
        bc.write(buffer, options={
            "module_width": 0.4,
            "module_height": 15.0,
            "font_size": 10,
            "text_distance": 5.0,
            "quiet_zone": 6.5
        })
        buffer.seek(0)

        return StreamingResponse(
            buffer,
            media_type="image/png",
            headers={
                "Content-Disposition": f"inline; filename=barcode-{row[1]}.png"
            }
        )
    except HTTPException:
        raise
    except ImportError:
        raise HTTPException(500, "Barcode library not installed. Run: pip install python-barcode Pillow")
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 5. Update Batch Details
@router.put("/{batch_id}", response_model=BatchTrackingOut)
def update_batch_tracking(
    batch_id: int,
    update: BatchTrackingUpdate,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        fields = []
        values = []

        if update.manufacturing_date is not None:
            fields.append("manufacturing_date = %s")
            values.append(update.manufacturing_date)
        if update.expiry_date is not None:
            fields.append("expiry_date = %s")
            values.append(update.expiry_date)
        if update.procurement_price is not None:
            fields.append("procurement_price = %s")
            values.append(update.procurement_price)
        if update.state_of_origin is not None:
            fields.append("state_of_origin = %s")
            values.append(update.state_of_origin)
        if update.batch_description is not None:
            fields.append("batch_description = %s")
            values.append(update.batch_description)
        if update.variant_id is not None:
            fields.append("variant_id = %s")
            values.append(update.variant_id)

        if not fields:
            raise HTTPException(400, "No fields to update")

        values.append(batch_id)
        sql = f"UPDATE batch_tracking SET {', '.join(fields)} WHERE id = %s RETURNING id"

        cur.execute(sql, tuple(values))
        result = cur.fetchone()

        if not result:
            raise HTTPException(404, "Batch not found")

        create_audit_log(
            user=current_user, action="UPDATE_BATCH_TRACKING", request=request,
            target_table="batch_tracking", target_id=batch_id,
            details={k: str(v) for k, v in update.dict().items() if v is not None}
        )

        conn.commit()

        # Re-fetch full data
        return get_batch_details(batch_id, current_user)
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 6. Generate Batch Entries for a PO being received
@router.post("/generate-for-po/{po_id}")
def generate_batches_for_po(
    po_id: int,
    batch_details: List[BatchTrackingCreate],
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    """
    Called during PO receive flow. Creates batch_tracking entries for each item in the PO.
    Returns the created batch IDs for linking to inventory_batches.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Verify PO exists
        cur.execute("SELECT id, supplier_id, status FROM purchase_orders WHERE id = %s", (po_id,))
        po = cur.fetchone()
        if not po:
            raise HTTPException(404, "Purchase order not found")

        created_batches = []

        for batch_data in batch_details:
            # Auto-fill supplier from PO if not provided
            supplier_id = batch_data.supplier_id or po[1]

            # Auto-fetch state_of_origin
            state_of_origin = batch_data.state_of_origin
            if not state_of_origin and supplier_id:
                cur.execute("SELECT location FROM suppliers WHERE id = %s", (supplier_id,))
                sup = cur.fetchone()
                if sup and sup[0]:
                    state_of_origin = sup[0]

            batch_code = generate_batch_code(batch_data.product_id, po_id)

            cur.execute("""
                INSERT INTO batch_tracking
                (batch_code, product_id, variant_id, supplier_id, manufacturing_date,
                 expiry_date, procurement_price, state_of_origin, batch_description,
                 po_id, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, batch_code;
            """, (
                batch_code, batch_data.product_id, batch_data.variant_id,
                supplier_id, batch_data.manufacturing_date,
                batch_data.expiry_date, batch_data.procurement_price,
                state_of_origin, batch_data.batch_description,
                po_id, current_user.username
            ))

            row = cur.fetchone()
            created_batches.append({
                "id": row[0],
                "batch_code": row[1],
                "product_id": batch_data.product_id,
                "variant_id": batch_data.variant_id
            })

        create_audit_log(
            user=current_user, action="GENERATE_PO_BATCHES", request=request,
            target_table="batch_tracking", target_id=po_id,
            details={"po_id": po_id, "batch_count": len(created_batches)}
        )

        conn.commit()
        cur.close()

        return {
            "status": "success",
            "message": f"Created {len(created_batches)} batch tracking entries",
            "batches": created_batches
        }
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()
