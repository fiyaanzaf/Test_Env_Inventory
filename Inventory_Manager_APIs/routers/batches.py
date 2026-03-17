from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Annotated, List, Optional
from datetime import date, datetime
from security import check_role, User, get_db_connection, create_audit_log, SECRET_KEY, ALGORITHM
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
    product_name: Optional[str] = None
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
    batch_tag: str = 'normal'
    tag_discount_percent: Optional[float] = None
    tag_reason: Optional[str] = None
    tag_set_by: Optional[str] = None
    tag_set_at: Optional[datetime] = None


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


class BatchTagUpdate(BaseModel):
    batch_tag: str  # 'normal', 'clearance', 'promotional', 'priority'
    tag_discount_percent: Optional[float] = None
    tag_reason: Optional[str] = None


class BatchTransferRequest(BaseModel):
    source_batch_id: int
    destination_batch_id: int
    quantity: int


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




# --- Shared SQL for batch queries with tag fields ---
BATCH_SELECT_SQL = """
    SELECT 
        bt.id, bt.batch_code, bt.product_id, p.name as product_name,
        bt.variant_id, pv.variant_name,
        bt.supplier_id, s.name as supplier_name,
        bt.manufacturing_date, bt.expiry_date,
        bt.procurement_price, bt.state_of_origin,
        bt.batch_description, bt.po_id,
        bt.created_at, bt.created_by,
        COALESCE(SUM(ib.quantity), 0) as stock_quantity,
        bt.batch_tag, bt.tag_discount_percent, bt.tag_reason,
        bt.tag_set_by, bt.tag_set_at
    FROM batch_tracking bt
    JOIN products p ON bt.product_id = p.id
    LEFT JOIN product_variants pv ON bt.variant_id = pv.id
    LEFT JOIN suppliers s ON bt.supplier_id = s.id
    LEFT JOIN inventory_batches ib ON ib.tracking_batch_id = bt.id AND ib.quantity > 0
"""

BATCH_GROUP_BY = "GROUP BY bt.id, p.name, pv.variant_name, s.name"


def _parse_batch_row(r) -> BatchTrackingOut:
    return BatchTrackingOut(
        id=r[0], batch_code=r[1], product_id=r[2], product_name=r[3],
        variant_id=r[4], variant_name=r[5],
        supplier_id=r[6], supplier_name=r[7],
        manufacturing_date=r[8], expiry_date=r[9],
        procurement_price=float(r[10]) if r[10] else None,
        state_of_origin=r[11], batch_description=r[12],
        po_id=r[13], created_at=r[14], created_by=r[15],
        stock_quantity=int(r[16]),
        batch_tag=r[17] or 'normal',
        tag_discount_percent=float(r[18]) if r[18] else None,
        tag_reason=r[19], tag_set_by=r[20], tag_set_at=r[21]
    )


# --- COMBINED endpoint for Batch Tracking Hub (single DB connection) ---
@router.get("/hub-data")
def get_batch_hub_data(
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Returns ALL data needed by the Batch Tracking Hub page in a single request
    using a single DB connection. Replaces 5 separate API calls.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # ─── 1. ALL tracked batches (for tree view + by-PO) ───
        cur.execute(f"""
            {BATCH_SELECT_SQL}
            {BATCH_GROUP_BY}
            ORDER BY p.name, bt.variant_id NULLS FIRST, bt.expiry_date ASC NULLS LAST;
        """)
        tracked_rows = cur.fetchall()
        all_tracked = [_parse_batch_row(r) for r in tracked_rows]

        # ─── 2. Untracked inventory batches (legacy stock) ───
        cur.execute("""
            SELECT 
                ib.id, ib.batch_code, ib.product_id, p.name as product_name,
                ib.variant_id, pv.variant_name,
                NULL as supplier_id, NULL as supplier_name,
                NULL as manufacturing_date, ib.expiry_date,
                ib.unit_cost, NULL as state_of_origin,
                NULL as batch_description, NULL as po_id,
                ib.received_at as created_at, NULL as created_by,
                ib.quantity as stock_quantity,
                'normal' as batch_tag, NULL as tag_discount_percent,
                NULL as tag_reason, NULL as tag_set_by, NULL as tag_set_at
            FROM inventory_batches ib
            JOIN products p ON ib.product_id = p.id
            LEFT JOIN product_variants pv ON ib.variant_id = pv.id
            WHERE ib.tracking_batch_id IS NULL AND ib.quantity > 0
            ORDER BY p.name, ib.variant_id NULLS FIRST, ib.expiry_date ASC NULLS LAST;
        """)
        untracked_rows = cur.fetchall()

        # ─── 3. PO metadata (reuse same cursor) ───
        po_ids = list(set(b.po_id for b in all_tracked if b.po_id))
        po_meta = {}
        if po_ids:
            cur.execute("""
                SELECT po.id, 
                       CONCAT('PO-', po.supplier_id, '-', TO_CHAR(po.created_at, 'YYYYMMDD')) as po_number,
                       s.name as supplier_name, s.id as supplier_id,
                       po.created_at, po.status
                FROM purchase_orders po
                JOIN suppliers s ON po.supplier_id = s.id
                WHERE po.id = ANY(%s)
            """, (po_ids,))
            for r in cur.fetchall():
                po_meta[r[0]] = {
                    "po_number": r[1],
                    "supplier_name": r[2],
                    "supplier_id": r[3],
                    "received_date": r[4].isoformat() if r[4] else None,
                    "status": r[5]
                }

        cur.close()
        # Connection closed in finally — all queries done

        # ─── Build tree_data (product → variant → batches) ───
        products = {}

        def add_batch_to_tree(batch):
            pid = batch.product_id
            pname = batch.product_name or f"Product {pid}"
            if pid not in products:
                products[pid] = {
                    "product_id": pid, "product_name": pname,
                    "total_batches": 0, "total_quantity": 0, "variants": {}
                }
            vkey = batch.variant_id or 0
            vname = batch.variant_name or "Base Product"
            if vkey not in products[pid]["variants"]:
                products[pid]["variants"][vkey] = {
                    "variant_id": batch.variant_id, "variant_name": vname,
                    "batches": [], "total_quantity": 0
                }
            products[pid]["variants"][vkey]["batches"].append(batch)
            products[pid]["variants"][vkey]["total_quantity"] += batch.stock_quantity
            products[pid]["total_batches"] += 1
            products[pid]["total_quantity"] += batch.stock_quantity

        for b in all_tracked:
            add_batch_to_tree(b)
        for r in untracked_rows:
            batch = BatchTrackingOut(
                id=-r[0], batch_code=r[1] or f"LEGACY-{r[0]}",
                product_id=r[2], product_name=r[3],
                variant_id=r[4], variant_name=r[5],
                supplier_id=None, supplier_name=None,
                manufacturing_date=None, expiry_date=r[9],
                procurement_price=float(r[10]) if r[10] else None,
                state_of_origin=None, batch_description="Untracked inventory batch",
                po_id=None, created_at=r[14], created_by=None,
                stock_quantity=int(r[16]),
                batch_tag='normal', tag_discount_percent=None,
                tag_reason=None, tag_set_by=None, tag_set_at=None
            )
            add_batch_to_tree(batch)

        tree_data = []
        for p in products.values():
            p["variants"] = list(p["variants"].values())
            tree_data.append(p)

        # ─── Build clearance data (from tracked batches with stock) ───
        from datetime import timedelta
        cutoff = date.today() + timedelta(days=30)
        clearance_batches = [
            b for b in all_tracked
            if b.expiry_date and b.expiry_date <= cutoff and b.stock_quantity > 0
        ]
        clearance_batches.sort(key=lambda b: b.expiry_date)
        expired = [b for b in clearance_batches if b.expiry_date < date.today()]
        near = [b for b in clearance_batches if b.expiry_date >= date.today()]

        # ─── Build tag-based lists (from tracked batches with stock) ───
        promo_batches = [b for b in all_tracked if b.batch_tag == 'promotional' and b.stock_quantity > 0]
        priority_batches = [b for b in all_tracked if b.batch_tag == 'priority' and b.stock_quantity > 0]
        promo_batches.sort(key=lambda b: b.expiry_date or '9999-12-31')
        priority_batches.sort(key=lambda b: b.expiry_date or '9999-12-31')

        # ─── Build PO groups (from tracked batches) ───
        from collections import OrderedDict
        # Re-sort for PO grouping
        po_sorted = sorted(all_tracked, key=lambda b: (-(b.po_id or 0), b.created_at.isoformat() if b.created_at else ''), reverse=False)
        po_sorted = sorted(all_tracked, key=lambda b: (-(b.po_id or 0),))
        po_groups_dict = OrderedDict()
        for b in po_sorted:
            key = b.po_id or 0
            if key not in po_groups_dict:
                po_groups_dict[key] = []
            po_groups_dict[key].append(b)

        po_data = []
        for po_id, po_batches in po_groups_dict.items():
            meta = po_meta.get(po_id, {})
            total_qty = sum(b.stock_quantity for b in po_batches)
            total_val = sum((b.procurement_price or 0) * b.stock_quantity for b in po_batches)
            unique_products = len(set(b.product_id for b in po_batches))
            po_data.append({
                "po_id": po_id if po_id else None,
                "po_number": meta.get("po_number", "Untracked Inventory"),
                "supplier_name": meta.get("supplier_name", "—"),
                "supplier_id": meta.get("supplier_id"),
                "received_date": meta.get("received_date"),
                "status": meta.get("status", "unknown"),
                "total_products": unique_products,
                "total_quantity": total_qty,
                "total_value": round(total_val, 2),
                "batches": [b.model_dump(mode='json') for b in po_batches]
            })

        return {
            "tree_data": tree_data,
            "clearance": {
                "total": len(clearance_batches),
                "expired_count": len(expired),
                "near_expiry_count": len(near),
                "batches": clearance_batches,
            },
            "promotional": promo_batches,
            "priority": priority_batches,
            "po_groups": po_data,
        }

    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


@router.get("/by-po")
def get_batches_by_po(
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """Group batches by purchase order — 1 PO = 1 supplier shipment."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Get all tracked batches with PO info
        cur.execute(f"""
            {BATCH_SELECT_SQL}
            {BATCH_GROUP_BY}
            ORDER BY bt.po_id DESC NULLS LAST, bt.created_at DESC;
        """)
        rows = cur.fetchall()
        batches = [_parse_batch_row(r) for r in rows]

        # Get PO metadata for all referenced POs
        po_ids = list(set(b.po_id for b in batches if b.po_id))
        po_meta = {}
        if po_ids:
            cur.execute("""
                SELECT po.id, 
                       CONCAT('PO-', po.supplier_id, '-', TO_CHAR(po.created_at, 'YYYYMMDD')) as po_number,
                       s.name as supplier_name, s.id as supplier_id,
                       po.created_at, po.status
                FROM purchase_orders po
                JOIN suppliers s ON po.supplier_id = s.id
                WHERE po.id = ANY(%s)
            """, (po_ids,))
            for r in cur.fetchall():
                po_meta[r[0]] = {
                    "po_number": r[1],
                    "supplier_name": r[2],
                    "supplier_id": r[3],
                    "received_date": r[4].isoformat() if r[4] else None,
                    "status": r[5]
                }

        cur.close()

        # Group batches by po_id
        from collections import OrderedDict
        groups = OrderedDict()
        for b in batches:
            key = b.po_id or 0  # 0 = untracked
            if key not in groups:
                groups[key] = []
            groups[key].append(b)

        result = []
        for po_id, po_batches in groups.items():
            meta = po_meta.get(po_id, {})
            total_qty = sum(b.stock_quantity for b in po_batches)
            total_val = sum((b.procurement_price or 0) * b.stock_quantity for b in po_batches)
            unique_products = len(set(b.product_id for b in po_batches))

            result.append({
                "po_id": po_id if po_id else None,
                "po_number": meta.get("po_number", "Untracked Inventory"),
                "supplier_name": meta.get("supplier_name", "—"),
                "supplier_id": meta.get("supplier_id"),
                "received_date": meta.get("received_date"),
                "status": meta.get("status", "unknown"),
                "total_products": unique_products,
                "total_quantity": total_qty,
                "total_value": round(total_val, 2),
                "batches": [b.model_dump(mode='json') for b in po_batches]
            })

        return result

    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 7. Get ALL Batches (for tree view) - includes tracked AND untracked stock
@router.get("/all")
def get_all_batches(
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # 1. Get tracked batches (from batch_tracking table)
        cur.execute(f"""
            {BATCH_SELECT_SQL}
            {BATCH_GROUP_BY}
            ORDER BY p.name, bt.variant_id NULLS FIRST, bt.expiry_date ASC NULLS LAST;
        """)
        tracked_rows = cur.fetchall()

        # 2. Get untracked inventory_batches (legacy stock without batch_tracking)
        cur.execute("""
            SELECT 
                ib.id, ib.batch_code, ib.product_id, p.name as product_name,
                ib.variant_id, pv.variant_name,
                NULL as supplier_id, NULL as supplier_name,
                NULL as manufacturing_date, ib.expiry_date,
                ib.unit_cost, NULL as state_of_origin,
                NULL as batch_description, NULL as po_id,
                ib.received_at as created_at, NULL as created_by,
                ib.quantity as stock_quantity,
                'normal' as batch_tag, NULL as tag_discount_percent,
                NULL as tag_reason, NULL as tag_set_by, NULL as tag_set_at
            FROM inventory_batches ib
            JOIN products p ON ib.product_id = p.id
            LEFT JOIN product_variants pv ON ib.variant_id = pv.id
            WHERE ib.tracking_batch_id IS NULL AND ib.quantity > 0
            ORDER BY p.name, ib.variant_id NULLS FIRST, ib.expiry_date ASC NULLS LAST;
        """)
        untracked_rows = cur.fetchall()
        cur.close()

        # Group by product → variant → batches (tree structure)
        products = {}

        def add_batch_to_tree(batch):
            pid = batch.product_id
            pname = batch.product_name or f"Product {pid}"

            if pid not in products:
                products[pid] = {
                    "product_id": pid,
                    "product_name": pname,
                    "total_batches": 0,
                    "total_quantity": 0,
                    "variants": {}
                }

            vkey = batch.variant_id or 0
            vname = batch.variant_name or "Base Product"
            if vkey not in products[pid]["variants"]:
                products[pid]["variants"][vkey] = {
                    "variant_id": batch.variant_id,
                    "variant_name": vname,
                    "batches": [],
                    "total_quantity": 0
                }

            products[pid]["variants"][vkey]["batches"].append(batch)
            products[pid]["variants"][vkey]["total_quantity"] += batch.stock_quantity
            products[pid]["total_batches"] += 1
            products[pid]["total_quantity"] += batch.stock_quantity

        # Add tracked batches
        for r in tracked_rows:
            add_batch_to_tree(_parse_batch_row(r))

        # Add untracked batches (same row format)
        for r in untracked_rows:
            batch = BatchTrackingOut(
                id=-r[0],  # Negative ID to distinguish from tracked batches
                batch_code=r[1] or f"LEGACY-{r[0]}",
                product_id=r[2], product_name=r[3],
                variant_id=r[4], variant_name=r[5],
                supplier_id=None, supplier_name=None,
                manufacturing_date=None, expiry_date=r[9],
                procurement_price=float(r[10]) if r[10] else None,
                state_of_origin=None, batch_description="Untracked inventory batch",
                po_id=None, created_at=r[14], created_by=None,
                stock_quantity=int(r[16]),
                batch_tag='normal', tag_discount_percent=None,
                tag_reason=None, tag_set_by=None, tag_set_at=None
            )
            add_batch_to_tree(batch)

        # Convert variants dict to list
        result = []
        for p in products.values():
            p["variants"] = list(p["variants"].values())
            result.append(p)

        return result
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 8. Get Clearance Batches (near expiry)
@router.get("/clearance")
def get_clearance_batches(
    days: int = 30,
    current_user: Annotated[User, Depends(check_role("employee"))] = None
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute(f"""
            {BATCH_SELECT_SQL}
            WHERE bt.expiry_date IS NOT NULL 
              AND bt.expiry_date <= CURRENT_DATE + INTERVAL '%s days'
            {BATCH_GROUP_BY}
            HAVING COALESCE(SUM(ib.quantity), 0) > 0
            ORDER BY bt.expiry_date ASC;
        """, (days,))
        rows = cur.fetchall()
        cur.close()

        batches = [_parse_batch_row(r) for r in rows]
        expired = [b for b in batches if b.expiry_date and b.expiry_date < date.today()]
        near = [b for b in batches if b.expiry_date and b.expiry_date >= date.today()]

        return {
            "total": len(batches),
            "expired_count": len(expired),
            "near_expiry_count": len(near),
            "batches": batches
        }
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 9. Scan/Lookup Batch by Code
@router.get("/scan/{code}")
def scan_batch(
    code: str,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Search by exact batch_code or by ID-based barcode format (BT-{id})
        batch_id = None
        if code.startswith("BT-") and code[3:].isdigit():
            batch_id = int(code[3:])

        if batch_id:
            cur.execute(f"""
                {BATCH_SELECT_SQL}
                WHERE bt.id = %s
                {BATCH_GROUP_BY};
            """, (batch_id,))
        else:
            cur.execute(f"""
                {BATCH_SELECT_SQL}
                WHERE bt.batch_code ILIKE %s OR bt.batch_code = %s
                {BATCH_GROUP_BY};
            """, (f"%{code}%", code))

        rows = cur.fetchall()
        cur.close()

        if not rows:
            raise HTTPException(404, f"No batch found for code: {code}")

        return [_parse_batch_row(r) for r in rows]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 10. Transfer Stock Between Batches
@router.post("/transfer")
def transfer_batch_stock(
    transfer: BatchTransferRequest,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        if transfer.quantity <= 0:
            raise HTTPException(400, "Quantity must be positive")

        if transfer.source_batch_id == transfer.destination_batch_id:
            raise HTTPException(400, "Source and destination must be different")

        # Get source batch inventory
        cur.execute("""
            SELECT ib.id, ib.quantity, ib.product_id, ib.location_id, ib.variant_id
            FROM inventory_batches ib
            WHERE ib.tracking_batch_id = %s AND ib.quantity > 0
            ORDER BY ib.quantity DESC
            LIMIT 1
        """, (transfer.source_batch_id,))
        source = cur.fetchone()

        if not source:
            raise HTTPException(400, "Source batch has no stock")
        if source[1] < transfer.quantity:
            raise HTTPException(400, f"Insufficient stock. Source has {source[1]} units")

        # Verify destination batch exists
        cur.execute("SELECT id, product_id FROM batch_tracking WHERE id = %s", (transfer.destination_batch_id,))
        dest = cur.fetchone()
        if not dest:
            raise HTTPException(404, "Destination batch not found")

        # Deduct from source
        cur.execute("""
            UPDATE inventory_batches SET quantity = quantity - %s
            WHERE id = %s
        """, (transfer.quantity, source[0]))

        # Add to destination (find or create inventory_batch linked to dest)
        cur.execute("""
            SELECT id FROM inventory_batches 
            WHERE tracking_batch_id = %s AND location_id = %s AND quantity > 0
            LIMIT 1
        """, (transfer.destination_batch_id, source[3]))
        dest_inv = cur.fetchone()

        if dest_inv:
            cur.execute("""
                UPDATE inventory_batches SET quantity = quantity + %s
                WHERE id = %s
            """, (transfer.quantity, dest_inv[0]))
        else:
            # Create new inventory_batch linked to destination
            cur.execute("""
                INSERT INTO inventory_batches 
                (product_id, location_id, batch_code, quantity, expiry_date, 
                 unit_cost, received_at, variant_id, tracking_batch_id)
                SELECT %s, %s, bt.batch_code, %s, bt.expiry_date,
                       bt.procurement_price, CURRENT_TIMESTAMP, bt.variant_id, bt.id
                FROM batch_tracking bt WHERE bt.id = %s
            """, (source[2], source[3], transfer.quantity, transfer.destination_batch_id))

        create_audit_log(
            user=current_user, action="BATCH_TRANSFER", request=request,
            target_table="batch_tracking", target_id=transfer.source_batch_id,
            details={
                "from_batch": transfer.source_batch_id,
                "to_batch": transfer.destination_batch_id,
                "quantity": transfer.quantity
            }
        )

        conn.commit()
        cur.close()

        return {
            "status": "success",
            "message": f"Transferred {transfer.quantity} units from batch {transfer.source_batch_id} to {transfer.destination_batch_id}"
        }
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 11. Set Batch Tag
@router.put("/{batch_id}/tag")
def set_batch_tag(
    batch_id: int,
    tag_data: BatchTagUpdate,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    valid_tags = ['normal', 'clearance', 'promotional', 'priority']
    if tag_data.batch_tag not in valid_tags:
        raise HTTPException(400, f"Invalid tag. Must be one of: {valid_tags}")

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            UPDATE batch_tracking 
            SET batch_tag = %s, 
                tag_discount_percent = %s, 
                tag_reason = %s,
                tag_set_by = %s,
                tag_set_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING id
        """, (
            tag_data.batch_tag,
            tag_data.tag_discount_percent,
            tag_data.tag_reason,
            current_user.username,
            batch_id
        ))

        result = cur.fetchone()
        if not result:
            raise HTTPException(404, "Batch not found")

        create_audit_log(
            user=current_user, action="SET_BATCH_TAG", request=request,
            target_table="batch_tracking", target_id=batch_id,
            details={"tag": tag_data.batch_tag, "reason": tag_data.tag_reason}
        )

        conn.commit()
        cur.close()

        return get_batch_details(batch_id, current_user)
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 12. Get Batches by Tag
@router.get("/by-tag/{tag}")
def get_batches_by_tag(
    tag: str,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    valid_tags = ['normal', 'clearance', 'promotional', 'priority']
    if tag not in valid_tags:
        raise HTTPException(400, f"Invalid tag. Must be one of: {valid_tags}")

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute(f"""
            {BATCH_SELECT_SQL}
            WHERE bt.batch_tag = %s
            {BATCH_GROUP_BY}
            HAVING COALESCE(SUM(ib.quantity), 0) > 0
            ORDER BY bt.expiry_date ASC NULLS LAST;
        """, (tag,))
        rows = cur.fetchall()
        cur.close()

        return [_parse_batch_row(r) for r in rows]
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
    token: str = None,
    request: Request = None,
):
    # Support token via query param (for new-tab URL) or Authorization header
    from jose import jwt, JWTError
    auth_token = token
    if not auth_token and request:
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            auth_token = auth_header[7:]
    if not auth_token:
        raise HTTPException(401, "Not authenticated")
    try:
        jwt.decode(auth_token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Invalid token")
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT id, batch_code FROM batch_tracking WHERE id = %s", (batch_id,))
        row = cur.fetchone()
        cur.close()

        if not row:
            raise HTTPException(404, "Batch not found")

        # Generate QR code
        import qrcode
        from qrcode.image.styledpil import StyledPilImage
        from qrcode.image.styles.moduledrawers import RoundedModuleDrawer

        barcode_value = f"BT-{row[0]}"

        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=12,
            border=3,
        )
        qr.add_data(barcode_value)
        qr.make(fit=True)

        try:
            # Try styled QR (rounded modules)
            img = qr.make_image(
                image_factory=StyledPilImage,
                module_drawer=RoundedModuleDrawer()
            )
        except Exception:
            # Fallback to standard QR
            img = qr.make_image(fill_color="black", back_color="white")

        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)

        return StreamingResponse(
            buffer,
            media_type="image/png",
            headers={
                "Content-Disposition": f"inline; filename=qr-{row[1]}.png"
            }
        )
    except HTTPException:
        raise
    except ImportError:
        raise HTTPException(500, "QR code library not installed. Run: pip install qrcode[pil]")
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

