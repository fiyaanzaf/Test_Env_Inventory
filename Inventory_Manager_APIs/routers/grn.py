"""
GRN (Goods Receipt Notes) Router
Multi-step receive workflow: Start GRN → Scan items → QA → Confirm into inventory
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Annotated, List, Optional
from datetime import date, datetime, timedelta
from security import check_role, User, get_db_connection, create_audit_log
import uuid
import io

try:
    import qrcode
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

router = APIRouter(
    prefix="/api/v1/grn",
    tags=["Goods Receipt Notes"]
)


# ── Models ────────────────────────────────────────

class InvoiceItemAdjust(BaseModel):
    po_item_id: int
    invoiced_qty: Optional[int] = None
    unit_cost: Optional[float] = None
    hsn_code: Optional[str] = None
    tax_rate: Optional[float] = None


class StartGRNRequest(BaseModel):
    po_id: int
    invoice_number: str
    invoice_date: Optional[date] = None
    received_date: Optional[date] = None
    subtotal: Optional[float] = 0
    tax_amount: Optional[float] = 0
    total_amount: Optional[float] = 0
    payment_due_date: Optional[date] = None
    notes: Optional[str] = None
    item_adjustments: Optional[List[InvoiceItemAdjust]] = None


class ScanItemRequest(BaseModel):
    universal_barcode: str
    product_id: Optional[int] = None
    received_qty: Optional[int] = None


class UpdateInvoiceRequest(BaseModel):
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    subtotal: Optional[float] = None
    tax_amount: Optional[float] = None
    total_amount: Optional[float] = None
    payment_status: Optional[str] = None
    payment_due_date: Optional[date] = None
    notes: Optional[str] = None


class QADecision(BaseModel):
    item_id: int
    status: str  # 'approved' or 'rejected'
    notes: Optional[str] = None


class QASubmitRequest(BaseModel):
    decisions: List[QADecision]


class ConfirmGRNRequest(BaseModel):
    warehouse_id: int


# ── Helpers ───────────────────────────────────────

def generate_internal_code(grn_id: int, product_id: int) -> str:
    short_uuid = str(uuid.uuid4())[:8].upper()
    return f"INT-GRN{grn_id}-P{product_id}-{short_uuid}"


# ══════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════

# 1. START GRN ─────────────────────────────────────
@router.post("/start")
def start_grn(
    data: StartGRNRequest,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """Start a new GRN session: creates supplier invoice + GRN record."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Validate PO exists and is 'placed'
        cur.execute("""
            SELECT po.status, po.supplier_id, s.name
            FROM purchase_orders po
            JOIN suppliers s ON po.supplier_id = s.id
            WHERE po.id = %s
        """, (data.po_id,))
        po = cur.fetchone()
        if not po:
            raise HTTPException(404, "Purchase order not found")
        if po[0] != 'placed':
            raise HTTPException(400, f"PO must be 'placed' to receive. Current status: {po[0]}")

        supplier_id = po[1]
        supplier_name = po[2]

        # Check for existing active GRN — auto-resume if found
        cur.execute("""
            SELECT id, invoice_id, status, created_at FROM goods_receipt_notes
            WHERE po_id = %s AND status IN ('scanning', 'qa_pending')
        """, (data.po_id,))
        existing = cur.fetchone()
        if existing:
            # Auto-resume: return existing GRN instead of erroring
            conn.close()
            return {
                "grn_id": existing[0],
                "invoice_id": existing[1],
                "po_id": data.po_id,
                "supplier": supplier_name,
                "status": existing[2],
                "resumed": True,
                "created_at": str(existing[3]),
                "message": f"Resumed active GRN #{existing[0]}"
            }

        # Create supplier invoice
        cur.execute("""
            INSERT INTO supplier_invoices
            (po_id, supplier_id, invoice_number, invoice_date, received_date,
             subtotal, tax_amount, total_amount, payment_status, payment_due_date,
             notes, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'unpaid', %s, %s, %s)
            RETURNING id
        """, (
            data.po_id, supplier_id, data.invoice_number,
            data.invoice_date or date.today(),
            data.received_date or date.today(),
            data.subtotal or 0, data.tax_amount or 0, data.total_amount or 0,
            data.payment_due_date, data.notes,
            current_user.username
        ))
        invoice_id = cur.fetchone()[0]

        # Get PO items
        cur.execute("""
            SELECT poi.id, poi.product_id, poi.variant_id, poi.quantity_ordered, poi.unit_cost,
                   p.name AS product_name,
                   pv.variant_name
            FROM purchase_order_items poi
            JOIN products p ON poi.product_id = p.id
            LEFT JOIN product_variants pv ON poi.variant_id = pv.id
            WHERE poi.po_id = %s
        """, (data.po_id,))
        po_items = cur.fetchall()

        if not po_items:
            raise HTTPException(400, "PO has no items")

        # Build adjustments lookup
        adjustments = {}
        if data.item_adjustments:
            for adj in data.item_adjustments:
                adjustments[adj.po_item_id] = adj

        # Create supplier_invoice_items from PO items
        invoice_items = []
        for item in po_items:
            poi_id, product_id, variant_id, ordered_qty, unit_cost, product_name, variant_name = item

            # Apply adjustments if provided
            adj = adjustments.get(poi_id)
            inv_qty = adj.invoiced_qty if adj and adj.invoiced_qty is not None else ordered_qty
            inv_cost = adj.unit_cost if adj and adj.unit_cost is not None else float(unit_cost or 0)
            hsn = adj.hsn_code if adj else None
            tax_rate = adj.tax_rate if adj and adj.tax_rate is not None else 0

            line_total = inv_qty * inv_cost

            cur.execute("""
                INSERT INTO supplier_invoice_items
                (invoice_id, po_item_id, product_id, variant_id, product_name, variant_name,
                 invoiced_qty, unit_cost, line_total, hsn_code, tax_rate)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                invoice_id, poi_id, product_id, variant_id,
                product_name, variant_name,
                inv_qty, inv_cost, line_total, hsn, tax_rate
            ))
            inv_item_id = cur.fetchone()[0]
            invoice_items.append({
                "id": inv_item_id,
                "po_item_id": poi_id,
                "product_id": product_id,
                "variant_id": variant_id,
                "product_name": product_name,
                "variant_name": variant_name,
                "invoiced_qty": inv_qty,
                "unit_cost": inv_cost,
                "line_total": line_total
            })

        # Create GRN record
        cur.execute("""
            INSERT INTO goods_receipt_notes
            (po_id, invoice_id, received_by, status)
            VALUES (%s, %s, %s, 'scanning')
            RETURNING id, created_at
        """, (data.po_id, invoice_id, current_user.username))
        grn_row = cur.fetchone()
        grn_id = grn_row[0]

        create_audit_log(current_user, "START_GRN", request, "goods_receipt_notes", grn_id,
                         {"po_id": data.po_id, "invoice_number": data.invoice_number})

        conn.commit()
        return {
            "grn_id": grn_id,
            "invoice_id": invoice_id,
            "po_id": data.po_id,
            "supplier": supplier_name,
            "status": "scanning",
            "invoice_items": invoice_items,
            "created_at": str(grn_row[1])
        }

    except HTTPException:
        if conn: conn.rollback()
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 2. GET GRN DETAILS ───────────────────────────────
@router.get("/{grn_id}")
def get_grn_details(
    grn_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # GRN header
        cur.execute("""
            SELECT g.id, g.po_id, g.invoice_id, g.received_by, g.status,
                   g.warehouse_id, g.created_at, g.completed_at, g.notes,
                   si.invoice_number, si.invoice_date, si.total_amount, si.payment_status,
                   s.name AS supplier_name, po.status AS po_status
            FROM goods_receipt_notes g
            LEFT JOIN supplier_invoices si ON g.invoice_id = si.id
            LEFT JOIN purchase_orders po ON g.po_id = po.id
            LEFT JOIN suppliers s ON si.supplier_id = s.id
            WHERE g.id = %s
        """, (grn_id,))
        grn = cur.fetchone()
        if not grn:
            raise HTTPException(404, "GRN not found")

        # Invoice items
        cur.execute("""
            SELECT id, po_item_id, product_id, variant_id, product_name, variant_name,
                   invoiced_qty, unit_cost, line_total, hsn_code, tax_rate
            FROM supplier_invoice_items
            WHERE invoice_id = %s
            ORDER BY id
        """, (grn[2],))
        inv_items = [
            {
                "id": r[0], "po_item_id": r[1], "product_id": r[2], "variant_id": r[3],
                "product_name": r[4], "variant_name": r[5], "invoiced_qty": r[6],
                "unit_cost": float(r[7] or 0), "line_total": float(r[8] or 0),
                "hsn_code": r[9], "tax_rate": float(r[10] or 0)
            }
            for r in cur.fetchall()
        ]

        # GRN scanned items
        cur.execute("""
            SELECT gi.id, gi.invoice_item_id, gi.po_item_id, gi.product_id, gi.variant_id,
                   gi.ordered_qty, gi.invoiced_qty, gi.received_qty, gi.unit_cost,
                   gi.universal_barcode, gi.internal_code, gi.qa_status, gi.qa_notes,
                   gi.scanned_at, p.name AS product_name, pv.variant_name
            FROM grn_items gi
            LEFT JOIN products p ON gi.product_id = p.id
            LEFT JOIN product_variants pv ON gi.variant_id = pv.id
            WHERE gi.grn_id = %s
            ORDER BY gi.id
        """, (grn_id,))
        scanned_items = [
            {
                "id": r[0], "invoice_item_id": r[1], "po_item_id": r[2],
                "product_id": r[3], "variant_id": r[4],
                "ordered_qty": r[5], "invoiced_qty": r[6], "received_qty": r[7],
                "unit_cost": float(r[8] or 0), "universal_barcode": r[9],
                "internal_code": r[10], "qa_status": r[11], "qa_notes": r[12],
                "scanned_at": str(r[13]) if r[13] else None,
                "product_name": r[14], "variant_name": r[15]
            }
            for r in cur.fetchall()
        ]

        return {
            "id": grn[0], "po_id": grn[1], "invoice_id": grn[2],
            "received_by": grn[3], "status": grn[4],
            "warehouse_id": grn[5],
            "created_at": str(grn[6]) if grn[6] else None,
            "completed_at": str(grn[7]) if grn[7] else None,
            "notes": grn[8],
            "invoice_number": grn[9], "invoice_date": str(grn[10]) if grn[10] else None,
            "invoice_total": float(grn[11] or 0), "payment_status": grn[12],
            "supplier_name": grn[13], "po_status": grn[14],
            "invoice_items": inv_items,
            "scanned_items": scanned_items
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 3. SCAN ITEM ─────────────────────────────────────
@router.post("/{grn_id}/scan")
def scan_grn_item(
    grn_id: int,
    data: ScanItemRequest,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """Scan a product barcode, match to PO item, generate internal code."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Validate GRN is in scanning state
        cur.execute("SELECT po_id, invoice_id, status FROM goods_receipt_notes WHERE id = %s", (grn_id,))
        grn = cur.fetchone()
        if not grn:
            raise HTTPException(404, "GRN not found")
        if grn[2] not in ('scanning', 'qa_pending'):
            raise HTTPException(400, f"GRN is in '{grn[2]}' state, cannot scan more items")

        po_id = grn[0]
        invoice_id = grn[1]

        # Try to identify product from barcode
        matched_product_id = data.product_id
        matched_variant_id = None

        if not matched_product_id:
            # Try products.barcode
            cur.execute("SELECT id FROM products WHERE barcode = %s", (data.universal_barcode,))
            row = cur.fetchone()
            if row:
                matched_product_id = row[0]
            else:
                # Try products.universal_barcode
                cur.execute("SELECT id FROM products WHERE universal_barcode = %s", (data.universal_barcode,))
                row = cur.fetchone()
                if row:
                    matched_product_id = row[0]
                else:
                    # Try product_variants.variant_barcode
                    cur.execute("""
                        SELECT product_id, id FROM product_variants
                        WHERE variant_barcode = %s AND is_active = TRUE
                    """, (data.universal_barcode,))
                    row = cur.fetchone()
                    if row:
                        matched_product_id = row[0]
                        matched_variant_id = row[1]

        if not matched_product_id:
            raise HTTPException(404,
                f"Could not match barcode '{data.universal_barcode}' to any product. "
                "Try providing product_id manually.")

        # Find matching PO item + invoice item
        cur.execute("""
            SELECT poi.id, poi.quantity_ordered, poi.unit_cost, poi.variant_id
            FROM purchase_order_items poi
            WHERE poi.po_id = %s AND poi.product_id = %s
            ORDER BY poi.id
        """, (po_id, matched_product_id))
        po_item = cur.fetchone()
        if not po_item:
            raise HTTPException(400,
                f"Product ID {matched_product_id} is not part of PO #{po_id}")

        po_item_id = po_item[0]
        ordered_qty = po_item[1]
        unit_cost = float(po_item[2] or 0)
        if not matched_variant_id and po_item[3]:
            matched_variant_id = po_item[3]

        # Check if already scanned
        cur.execute("""
            SELECT id FROM grn_items
            WHERE grn_id = %s AND product_id = %s
              AND (variant_id = %s OR (variant_id IS NULL AND %s IS NULL))
        """, (grn_id, matched_product_id, matched_variant_id, matched_variant_id))
        existing = cur.fetchone()
        if existing:
            raise HTTPException(400, "This product has already been scanned for this GRN")

        # Find invoice item
        cur.execute("""
            SELECT id, invoiced_qty, unit_cost
            FROM supplier_invoice_items
            WHERE invoice_id = %s AND product_id = %s
            ORDER BY id LIMIT 1
        """, (invoice_id, matched_product_id))
        inv_item = cur.fetchone()
        invoice_item_id = inv_item[0] if inv_item else None
        invoiced_qty = inv_item[1] if inv_item else ordered_qty
        inv_cost = float(inv_item[2] or unit_cost) if inv_item else unit_cost

        # Save barcode on product for future reference
        # If the product has no barcode in catalog yet, save the scanned one as the primary barcode
        cur.execute("""
            UPDATE products SET barcode = %s WHERE id = %s AND (barcode IS NULL OR barcode = '')
        """, (data.universal_barcode, matched_product_id))
        # Also save as universal_barcode for reference
        cur.execute("""
            UPDATE products SET universal_barcode = %s WHERE id = %s AND universal_barcode IS NULL
        """, (data.universal_barcode, matched_product_id))

        # Generate internal code
        internal_code = generate_internal_code(grn_id, matched_product_id)

        received_qty = data.received_qty if data.received_qty is not None else invoiced_qty

        # Create grn_item
        cur.execute("""
            INSERT INTO grn_items
            (grn_id, invoice_item_id, po_item_id, product_id, variant_id,
             ordered_qty, invoiced_qty, received_qty, unit_cost,
             universal_barcode, internal_code, qa_status, scanned_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', CURRENT_TIMESTAMP)
            RETURNING id, scanned_at
        """, (
            grn_id, invoice_item_id, po_item_id, matched_product_id, matched_variant_id,
            ordered_qty, invoiced_qty, received_qty, inv_cost,
            data.universal_barcode, internal_code
        ))
        item_row = cur.fetchone()

        # Get product name for response
        cur.execute("SELECT name FROM products WHERE id = %s", (matched_product_id,))
        product_name = cur.fetchone()[0]

        variant_name = None
        if matched_variant_id:
            cur.execute("SELECT variant_name FROM product_variants WHERE id = %s", (matched_variant_id,))
            vr = cur.fetchone()
            variant_name = vr[0] if vr else None

        conn.commit()
        return {
            "id": item_row[0],
            "grn_id": grn_id,
            "product_id": matched_product_id,
            "product_name": product_name,
            "variant_id": matched_variant_id,
            "variant_name": variant_name,
            "ordered_qty": ordered_qty,
            "invoiced_qty": invoiced_qty,
            "received_qty": received_qty,
            "unit_cost": inv_cost,
            "universal_barcode": data.universal_barcode,
            "internal_code": internal_code,
            "qa_status": "pending",
            "scanned_at": str(item_row[1])
        }

    except HTTPException:
        if conn: conn.rollback()
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 4. UPDATE INVOICE ────────────────────────────────
@router.put("/{grn_id}/invoice")
def update_grn_invoice(
    grn_id: int,
    data: UpdateInvoiceRequest,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT invoice_id FROM goods_receipt_notes WHERE id = %s", (grn_id,))
        grn = cur.fetchone()
        if not grn:
            raise HTTPException(404, "GRN not found")

        invoice_id = grn[0]
        updates = []
        values = []
        for field in ['invoice_number', 'invoice_date', 'subtotal', 'tax_amount',
                       'total_amount', 'payment_status', 'payment_due_date', 'notes']:
            val = getattr(data, field, None)
            if val is not None:
                updates.append(f"{field} = %s")
                values.append(val)

        if not updates:
            raise HTTPException(400, "No fields to update")

        values.append(invoice_id)
        cur.execute(f"UPDATE supplier_invoices SET {', '.join(updates)} WHERE id = %s", values)
        conn.commit()
        return {"status": "updated"}

    except HTTPException:
        if conn: conn.rollback()
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 5. GENERATE QR CODE ──────────────────────────────
@router.get("/{grn_id}/internal-code/{item_id}/qr")
def get_internal_code_qr(
    grn_id: int,
    item_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """Generate a QR code PNG for the internal code."""
    if not HAS_QRCODE:
        raise HTTPException(500, "qrcode library not installed. Run: pip install qrcode[pil]")

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT internal_code, product_id FROM grn_items
            WHERE id = %s AND grn_id = %s
        """, (item_id, grn_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "GRN item not found")

        internal_code = row[0]

        # Generate QR
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(internal_code)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        return StreamingResponse(
            buf,
            media_type="image/png",
            headers={"Content-Disposition": f"inline; filename={internal_code}.png"}
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 6. SUBMIT QA ─────────────────────────────────────
@router.put("/{grn_id}/qa")
def submit_qa_decisions(
    grn_id: int,
    data: QASubmitRequest,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Validate GRN
        cur.execute("SELECT status FROM goods_receipt_notes WHERE id = %s", (grn_id,))
        grn = cur.fetchone()
        if not grn:
            raise HTTPException(404, "GRN not found")
        if grn[0] not in ('scanning', 'qa_pending'):
            raise HTTPException(400, f"GRN is '{grn[0]}', cannot submit QA")

        approved = 0
        rejected = 0
        for decision in data.decisions:
            if decision.status not in ('approved', 'rejected'):
                raise HTTPException(400, f"Invalid QA status: {decision.status}")

            cur.execute("""
                UPDATE grn_items SET qa_status = %s, qa_notes = %s
                WHERE id = %s AND grn_id = %s
                RETURNING id
            """, (decision.status, decision.notes, decision.item_id, grn_id))
            if not cur.fetchone():
                raise HTTPException(404, f"GRN item #{decision.item_id} not found")

            if decision.status == 'approved':
                approved += 1
            else:
                rejected += 1

        # Update GRN status to qa_pending
        cur.execute("""
            UPDATE goods_receipt_notes SET status = 'qa_pending' WHERE id = %s
        """, (grn_id,))

        create_audit_log(current_user, "GRN_QA", request, "goods_receipt_notes", grn_id,
                         {"approved": approved, "rejected": rejected})

        conn.commit()
        return {"approved": approved, "rejected": rejected, "status": "qa_pending"}

    except HTTPException:
        if conn: conn.rollback()
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 7. CONFIRM GRN ───────────────────────────────────
@router.post("/{grn_id}/confirm")
def confirm_grn(
    grn_id: int,
    data: ConfirmGRNRequest,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """Final confirmation: approved items enter inventory."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Validate GRN
        cur.execute("SELECT po_id, invoice_id, status FROM goods_receipt_notes WHERE id = %s", (grn_id,))
        grn = cur.fetchone()
        if not grn:
            raise HTTPException(404, "GRN not found")
        if grn[2] not in ('qa_pending', 'scanning'):
            raise HTTPException(400, f"GRN is '{grn[2]}', cannot confirm")

        po_id = grn[0]

        # Check no pending items
        cur.execute("SELECT COUNT(*) FROM grn_items WHERE grn_id = %s AND qa_status = 'pending'", (grn_id,))
        pending = cur.fetchone()[0]
        if pending > 0:
            raise HTTPException(400, f"{pending} item(s) still pending QA review")

        # Validate warehouse
        cur.execute("SELECT location_type FROM locations WHERE id = %s", (data.warehouse_id,))
        loc = cur.fetchone()
        if not loc:
            raise HTTPException(404, "Warehouse not found")
        if loc[0] != 'warehouse':
            raise HTTPException(400, "Must receive into a warehouse location")

        # Get approved items
        cur.execute("""
            SELECT id, product_id, variant_id, received_qty, unit_cost, internal_code
            FROM grn_items
            WHERE grn_id = %s AND qa_status = 'approved'
        """, (grn_id,))
        approved_items = cur.fetchall()

        # Get rejected count
        cur.execute("SELECT COUNT(*) FROM grn_items WHERE grn_id = %s AND qa_status = 'rejected'", (grn_id,))
        rejected_count = cur.fetchone()[0]

        if not approved_items and rejected_count == 0:
            raise HTTPException(400, "No items to process")

        default_expiry = date.today() + timedelta(days=365)

        # Create inventory batches + batch_tracking for approved items
        for item in approved_items:
            item_id, product_id, variant_id, qty, cost, internal_code = item
            batch_code = f"PO-{po_id}-{date.today().strftime('%Y%m%d')}"

            # inventory_batches
            cur.execute("""
                INSERT INTO inventory_batches
                (product_id, location_id, batch_code, quantity, expiry_date,
                 unit_cost, received_at, variant_id)
                VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, %s)
                RETURNING id
            """, (product_id, data.warehouse_id, batch_code, qty, default_expiry, cost, variant_id))
            inv_batch_id = cur.fetchone()[0]

            # batch_tracking (if table exists)
            try:
                short_uuid = str(uuid.uuid4())[:8].upper()
                bt_code = f"BT-PO{po_id}-P{product_id}-{short_uuid}"
                cur.execute("""
                    INSERT INTO batch_tracking
                    (batch_code, product_id, variant_id, supplier_id, po_id,
                     procurement_price, created_by)
                    SELECT %s, %s, %s, po.supplier_id, %s, %s, %s
                    FROM purchase_orders po WHERE po.id = %s
                """, (bt_code, product_id, variant_id, po_id, cost,
                      current_user.username, po_id))

                # Link tracking batch to inventory batch
                cur.execute("""
                    SELECT id FROM batch_tracking WHERE batch_code = %s
                """, (bt_code,))
                bt = cur.fetchone()
                if bt:
                    cur.execute("""
                        UPDATE inventory_batches SET tracking_batch_id = %s WHERE id = %s
                    """, (bt[0], inv_batch_id))
            except Exception:
                pass  # batch_tracking table might not exist

        # Update PO status
        if rejected_count > 0 and len(approved_items) > 0:
            new_po_status = 'partially_received'
        elif len(approved_items) > 0:
            new_po_status = 'received'
        else:
            new_po_status = 'placed'  # All rejected, keep as placed

        cur.execute("UPDATE purchase_orders SET status = %s WHERE id = %s", (new_po_status, po_id))

        # Update GRN
        cur.execute("""
            UPDATE goods_receipt_notes
            SET status = 'completed', warehouse_id = %s, completed_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (data.warehouse_id, grn_id))

        # Resolve alerts
        cur.execute("""
            UPDATE system_alerts
            SET status = 'resolved', is_resolved = TRUE
            WHERE message LIKE %s
            AND message LIKE '%%ADDED TO ORDER%%'
            AND status = 'active'
        """, (f"%Purchase Order #{po_id}%",))

        create_audit_log(current_user, "CONFIRM_GRN", request, "goods_receipt_notes", grn_id,
                         {"warehouse_id": data.warehouse_id,
                          "approved": len(approved_items),
                          "rejected": rejected_count,
                          "po_status": new_po_status})

        conn.commit()
        return {
            "status": "completed",
            "approved_count": len(approved_items),
            "rejected_count": rejected_count,
            "po_status": new_po_status,
            "warehouse_id": data.warehouse_id
        }

    except HTTPException:
        if conn: conn.rollback()
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 8. CANCEL GRN ────────────────────────────────────
@router.delete("/{grn_id}")
def cancel_grn(
    grn_id: int,
    request: Request,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT status FROM goods_receipt_notes WHERE id = %s", (grn_id,))
        grn = cur.fetchone()
        if not grn:
            raise HTTPException(404, "GRN not found")
        if grn[0] == 'completed':
            raise HTTPException(400, "Cannot cancel a completed GRN")

        cur.execute("UPDATE goods_receipt_notes SET status = 'cancelled' WHERE id = %s", (grn_id,))

        create_audit_log(current_user, "CANCEL_GRN", request, "goods_receipt_notes", grn_id, {})
        conn.commit()
        return {"status": "cancelled"}

    except HTTPException:
        if conn: conn.rollback()
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 9. LIST GRNs ─────────────────────────────────────
@router.get("")
def list_grns(
    current_user: Annotated[User, Depends(check_role("employee"))],
    status: Optional[str] = None
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        query = """
            SELECT g.id, g.po_id, g.status, g.created_at, g.completed_at,
                   g.received_by, g.warehouse_id,
                   si.invoice_number, si.total_amount, si.payment_status,
                   s.name AS supplier_name,
                   (SELECT COUNT(*) FROM grn_items WHERE grn_id = g.id) AS item_count,
                   (SELECT COUNT(*) FROM grn_items WHERE grn_id = g.id AND qa_status = 'approved') AS approved_count
            FROM goods_receipt_notes g
            LEFT JOIN supplier_invoices si ON g.invoice_id = si.id
            LEFT JOIN suppliers s ON si.supplier_id = s.id
        """
        params = []
        if status:
            query += " WHERE g.status = %s"
            params.append(status)

        query += " ORDER BY g.created_at DESC"
        cur.execute(query, params)

        return [
            {
                "id": r[0], "po_id": r[1], "status": r[2],
                "created_at": str(r[3]) if r[3] else None,
                "completed_at": str(r[4]) if r[4] else None,
                "received_by": r[5], "warehouse_id": r[6],
                "invoice_number": r[7],
                "total_amount": float(r[8] or 0),
                "payment_status": r[9],
                "supplier_name": r[10],
                "item_count": r[11], "approved_count": r[12]
            }
            for r in cur.fetchall()
        ]

    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 10. LIST SUPPLIER INVOICES ───────────────────────
@router.get("/invoices")
def list_invoices(
    current_user: Annotated[User, Depends(check_role("employee"))],
    supplier_id: Optional[int] = None,
    payment_status: Optional[str] = None
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        query = """
            SELECT si.id, si.po_id, si.supplier_id, si.invoice_number,
                   si.invoice_date, si.received_date, si.subtotal, si.tax_amount,
                   si.total_amount, si.payment_status, si.payment_due_date,
                   si.created_at, s.name AS supplier_name
            FROM supplier_invoices si
            LEFT JOIN suppliers s ON si.supplier_id = s.id
            WHERE 1=1
        """
        params = []
        if supplier_id:
            query += " AND si.supplier_id = %s"
            params.append(supplier_id)
        if payment_status:
            query += " AND si.payment_status = %s"
            params.append(payment_status)

        query += " ORDER BY si.created_at DESC"
        cur.execute(query, params)

        return [
            {
                "id": r[0], "po_id": r[1], "supplier_id": r[2],
                "invoice_number": r[3],
                "invoice_date": str(r[4]) if r[4] else None,
                "received_date": str(r[5]) if r[5] else None,
                "subtotal": float(r[6] or 0), "tax_amount": float(r[7] or 0),
                "total_amount": float(r[8] or 0),
                "payment_status": r[9],
                "payment_due_date": str(r[10]) if r[10] else None,
                "created_at": str(r[11]) if r[11] else None,
                "supplier_name": r[12]
            }
            for r in cur.fetchall()
        ]

    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()
