from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Annotated, List, Optional
from datetime import datetime
from security import check_role, User, get_db_connection, create_audit_log

router = APIRouter(
    prefix="/api/v1/variants",
    tags=["Product Variants"]
)


# --- Pydantic Models ---

class VariantCreate(BaseModel):
    variant_name: str
    variant_sku: Optional[str] = None
    variant_barcode: Optional[str] = None
    selling_price: Optional[float] = None
    average_cost: Optional[float] = None
    unit_of_measure: Optional[str] = None


class VariantOut(BaseModel):
    id: int
    product_id: int
    variant_name: str
    variant_sku: Optional[str] = None
    variant_barcode: Optional[str] = None
    selling_price: Optional[float] = None
    average_cost: Optional[float] = None
    unit_of_measure: Optional[str] = None
    is_active: bool
    created_at: datetime
    total_quantity: int = 0


class VariantUpdate(BaseModel):
    variant_name: Optional[str] = None
    variant_sku: Optional[str] = None
    variant_barcode: Optional[str] = None
    selling_price: Optional[float] = None
    average_cost: Optional[float] = None
    unit_of_measure: Optional[str] = None
    is_active: Optional[bool] = None


# --- Endpoints ---

# 1. Create Variant under a Product
@router.post("/products/{product_id}", response_model=VariantOut)
def create_variant(
    product_id: int,
    variant: VariantCreate,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Verify product exists
        cur.execute("SELECT id, name FROM products WHERE id = %s", (product_id,))
        product = cur.fetchone()
        if not product:
            raise HTTPException(404, "Product not found")

        cur.execute("""
            INSERT INTO product_variants 
            (product_id, variant_name, variant_sku, variant_barcode, selling_price, average_cost, unit_of_measure)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, product_id, variant_name, variant_sku, variant_barcode, 
                      selling_price, average_cost, unit_of_measure, is_active, created_at;
        """, (
            product_id, variant.variant_name, variant.variant_sku,
            variant.variant_barcode, variant.selling_price,
            variant.average_cost, variant.unit_of_measure
        ))

        row = cur.fetchone()

        create_audit_log(
            user=current_user, action="CREATE_VARIANT", request=request,
            target_table="product_variants", target_id=row[0],
            details={"product_id": product_id, "variant_name": variant.variant_name}
        )

        conn.commit()
        cur.close()

        return VariantOut(
            id=row[0], product_id=row[1], variant_name=row[2],
            variant_sku=row[3], variant_barcode=row[4],
            selling_price=float(row[5]) if row[5] else None,
            average_cost=float(row[6]) if row[6] else None,
            unit_of_measure=row[7], is_active=row[8], created_at=row[9],
            total_quantity=0
        )
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        if "unique constraint" in str(e).lower():
            raise HTTPException(409, f"Variant '{variant.variant_name}' already exists for this product.")
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 2. Get All Variants for a Product
@router.get("/products/{product_id}", response_model=List[VariantOut])
def get_variants_for_product(
    product_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Verify product exists
        cur.execute("SELECT id FROM products WHERE id = %s", (product_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Product not found")

        cur.execute("""
            SELECT 
                pv.id, pv.product_id, pv.variant_name, pv.variant_sku,
                pv.variant_barcode, pv.selling_price, pv.average_cost,
                pv.unit_of_measure, pv.is_active, pv.created_at,
                COALESCE(SUM(ib.quantity), 0) as total_quantity
            FROM product_variants pv
            LEFT JOIN inventory_batches ib ON pv.id = ib.variant_id AND ib.quantity > 0
            WHERE pv.product_id = %s
            GROUP BY pv.id
            ORDER BY pv.created_at ASC;
        """, (product_id,))

        rows = cur.fetchall()
        cur.close()

        return [
            VariantOut(
                id=r[0], product_id=r[1], variant_name=r[2],
                variant_sku=r[3], variant_barcode=r[4],
                selling_price=float(r[5]) if r[5] else None,
                average_cost=float(r[6]) if r[6] else None,
                unit_of_measure=r[7], is_active=r[8], created_at=r[9],
                total_quantity=int(r[10])
            )
            for r in rows
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 3. Get Single Variant
@router.get("/{variant_id}", response_model=VariantOut)
def get_variant(
    variant_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT 
                pv.id, pv.product_id, pv.variant_name, pv.variant_sku,
                pv.variant_barcode, pv.selling_price, pv.average_cost,
                pv.unit_of_measure, pv.is_active, pv.created_at,
                COALESCE(SUM(ib.quantity), 0) as total_quantity
            FROM product_variants pv
            LEFT JOIN inventory_batches ib ON pv.id = ib.variant_id AND ib.quantity > 0
            WHERE pv.id = %s
            GROUP BY pv.id;
        """, (variant_id,))

        row = cur.fetchone()
        cur.close()

        if not row:
            raise HTTPException(404, "Variant not found")

        return VariantOut(
            id=row[0], product_id=row[1], variant_name=row[2],
            variant_sku=row[3], variant_barcode=row[4],
            selling_price=float(row[5]) if row[5] else None,
            average_cost=float(row[6]) if row[6] else None,
            unit_of_measure=row[7], is_active=row[8], created_at=row[9],
            total_quantity=int(row[10])
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 4. Update Variant
@router.put("/{variant_id}", response_model=VariantOut)
def update_variant(
    variant_id: int,
    update: VariantUpdate,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Build dynamic UPDATE
        fields = []
        values = []

        if update.variant_name is not None:
            fields.append("variant_name = %s")
            values.append(update.variant_name)
        if update.variant_sku is not None:
            fields.append("variant_sku = %s")
            values.append(update.variant_sku)
        if update.variant_barcode is not None:
            fields.append("variant_barcode = %s")
            values.append(update.variant_barcode)
        if update.selling_price is not None:
            fields.append("selling_price = %s")
            values.append(update.selling_price)
        if update.average_cost is not None:
            fields.append("average_cost = %s")
            values.append(update.average_cost)
        if update.unit_of_measure is not None:
            fields.append("unit_of_measure = %s")
            values.append(update.unit_of_measure)
        if update.is_active is not None:
            fields.append("is_active = %s")
            values.append(update.is_active)

        if not fields:
            raise HTTPException(400, "No fields to update")

        values.append(variant_id)
        sql = f"""
            UPDATE product_variants SET {', '.join(fields)}
            WHERE id = %s
            RETURNING id, product_id, variant_name, variant_sku, variant_barcode,
                      selling_price, average_cost, unit_of_measure, is_active, created_at;
        """

        cur.execute(sql, tuple(values))
        row = cur.fetchone()

        if not row:
            raise HTTPException(404, "Variant not found")

        create_audit_log(
            user=current_user, action="UPDATE_VARIANT", request=request,
            target_table="product_variants", target_id=variant_id,
            details={"updates": {k: v for k, v in update.dict().items() if v is not None}}
        )

        # Get stock quantity
        cur.execute("""
            SELECT COALESCE(SUM(quantity), 0) FROM inventory_batches 
            WHERE variant_id = %s AND quantity > 0
        """, (variant_id,))
        qty = cur.fetchone()[0]

        conn.commit()
        cur.close()

        return VariantOut(
            id=row[0], product_id=row[1], variant_name=row[2],
            variant_sku=row[3], variant_barcode=row[4],
            selling_price=float(row[5]) if row[5] else None,
            average_cost=float(row[6]) if row[6] else None,
            unit_of_measure=row[7], is_active=row[8], created_at=row[9],
            total_quantity=int(qty)
        )
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        if "unique constraint" in str(e).lower():
            raise HTTPException(409, "A variant with this name already exists for this product.")
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# 5. Delete Variant (soft deactivate)
@router.delete("/{variant_id}")
def delete_variant(
    variant_id: int,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Check if variant has stock
        cur.execute("""
            SELECT COALESCE(SUM(quantity), 0) FROM inventory_batches 
            WHERE variant_id = %s AND quantity > 0
        """, (variant_id,))
        stock = cur.fetchone()[0]

        if stock > 0:
            # Soft deactivate instead of hard delete
            cur.execute(
                "UPDATE product_variants SET is_active = FALSE WHERE id = %s RETURNING id",
                (variant_id,)
            )
            if not cur.fetchone():
                raise HTTPException(404, "Variant not found")
            msg = f"Variant deactivated (has {stock} units in stock)"
        else:
            # Hard delete if no stock
            cur.execute(
                "DELETE FROM product_variants WHERE id = %s RETURNING id",
                (variant_id,)
            )
            if not cur.fetchone():
                raise HTTPException(404, "Variant not found")
            msg = "Variant deleted successfully"

        create_audit_log(
            user=current_user, action="DELETE_VARIANT", request=request,
            target_table="product_variants", target_id=variant_id,
            details={"had_stock": stock > 0}
        )

        conn.commit()
        cur.close()

        return {"status": "success", "message": msg}
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()
