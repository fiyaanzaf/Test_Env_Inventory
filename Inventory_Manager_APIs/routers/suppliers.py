from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr
from typing import Annotated, List, Optional
import psycopg2
import os
from dotenv import load_dotenv
from datetime import datetime
from pydantic import BaseModel
# --- New Imports for Security ---
from security import check_role, User, get_db_connection, get_current_user, create_audit_log

router = APIRouter(
    prefix="/api/v1/suppliers",
    tags=["Suppliers"]
)

# --- Load Environment Variables ---
load_dotenv()
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

# --- Pydantic Data Models ---

# Input model (what the user sends)
class Supplier(BaseModel):
    name: str
    location: Optional[str] = None
    contact_person: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[EmailStr] = None

# Output model (what we send back)
class SupplierOut(BaseModel):
    id: int
    name: str
    location: Optional[str]
    contact_person: Optional[str]
    phone_number: Optional[str]
    email: Optional[EmailStr]
    created_at: datetime

class ProductSupplierLinkOut(BaseModel):
    id: int
    product_id: int
    product_name: str
    supplier_id: int
    supplier_name: str
    supply_price: float
    is_preferred: bool
    supplier_sku: Optional[str] = None

class ProductSupplierLinkCreate(BaseModel):
    product_id: int
    supplier_id: int
    supply_price: float
    supplier_sku: Optional[str] = None
    is_preferred: bool = False

# --- API Endpoints for Suppliers ---

# 0. Get All Product-Supplier Links (Joined Data) - for Catalog Table
@router.get("/product-links", response_model=List[ProductSupplierLinkOut])
def get_product_supplier_links():
    conn = None
    sql = """
    SELECT 
        ps.id,
        p.id as product_id,
        p.name as product_name,
        s.id as supplier_id,
        s.name as supplier_name,
        ps.supply_price,
        ps.is_preferred,
        ps.supplier_sku
    FROM product_suppliers ps
    JOIN products p ON ps.product_id = p.id
    JOIN suppliers s ON ps.supplier_id = s.id
    ORDER BY p.name ASC, s.name ASC
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(sql)
        rows = cur.fetchall()
        cur.close()
        
        links = []
        for row in rows:
            links.append(ProductSupplierLinkOut(
                id=row[0],
                product_id=row[1],
                product_name=row[2],
                supplier_id=row[3],
                supplier_name=row[4],
                supply_price=float(row[5]) if row[5] else 0.0,
                is_preferred=row[6],
                supplier_sku=row[7]
            ))
        return links
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# 0.5 Create a Product-Supplier Link (SECURED: Manager Only)
@router.post("/product-links", response_model=ProductSupplierLinkOut)
def create_product_supplier_link(
    link_data: ProductSupplierLinkCreate,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    sql = """
    INSERT INTO product_suppliers (product_id, supplier_id, supply_price, supplier_sku, is_preferred)
    VALUES (%s, %s, %s, %s, %s)
    RETURNING id, product_id, supplier_id, supply_price, supplier_sku, is_preferred;
    """
    
    # helper to get names
    sql_names = """
    SELECT p.name, s.name 
    FROM products p, suppliers s 
    WHERE p.id = %s AND s.id = %s
    """

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if link exists
        cur.execute("SELECT id FROM product_suppliers WHERE product_id = %s AND supplier_id = %s", (link_data.product_id, link_data.supplier_id))
        if cur.fetchone():
             raise HTTPException(status_code=409, detail="This product is already linked to this supplier.")

        # Create Link
        cur.execute(sql, (
            link_data.product_id, 
            link_data.supplier_id, 
            link_data.supply_price, 
            link_data.supplier_sku,
            link_data.is_preferred
        ))
        new_link = cur.fetchone()
        
        # Get Names
        cur.execute(sql_names, (link_data.product_id, link_data.supplier_id))
        names = cur.fetchone()
        
        if not names:
             # Should not happen if foreign keys are correct, but handling just in case
             conn.rollback() # Rolling back the insert if names are not found (implies invalid IDs but Postgres would catch that)
             raise HTTPException(status_code=404, detail="Product or Supplier not found.")

        conn.commit()
        
        # --- AUDIT LOGGING ---
        create_audit_log(
            user=current_user,
            action="CREATE_PRODUCT_SUPPLIER_LINK",
            request=request,
            target_table="product_suppliers",
            target_id=new_link[0],
            details={"product_id": link_data.product_id, "supplier_id": link_data.supplier_id}
        )
        
        cur.close()
        
        return ProductSupplierLinkOut(
            id=new_link[0],
            product_id=new_link[1],
            product_name=names[0],
            supplier_id=new_link[2],
            supplier_name=names[1],
            supply_price=float(new_link[3]),
            supplier_sku=new_link[4],
            is_preferred=new_link[5]
        )
    except Exception as e:
        if conn:
            conn.rollback()
        # Handle specific DB errors if needed
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# 0.6 Delete a Product-Supplier Link (SECURED: Manager Only)
@router.delete("/product-links/{link_id}")
def delete_product_supplier_link(
    link_id: int,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if exists
        cur.execute("SELECT id FROM product_suppliers WHERE id = %s", (link_id,))
        if not cur.fetchone():
             raise HTTPException(status_code=404, detail="Link not found")

        # Delete
        cur.execute("DELETE FROM product_suppliers WHERE id = %s RETURNING id", (link_id,))
        deleted_id = cur.fetchone()[0]
        
        conn.commit()
        
        # --- AUDIT LOGGING ---
        create_audit_log(
            user=current_user,
            action="DELETE_PRODUCT_SUPPLIER_LINK",
            request=request,
            target_table="product_suppliers",
            target_id=deleted_id,
            details={"deleted_link_id": deleted_id}
        )
        
        cur.close()
        
        return {"status": "success", "message": "Link deleted successfully"}
    except HTTPException as e:
        raise e
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# 0.7 Set Preferred Product-Supplier Link (SECURED: Manager Only)
@router.put("/product-links/{link_id}/preferred")
def set_preferred_supplier_link(
    link_id: int,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # 1. Get product_id for this link
        cur.execute("SELECT product_id FROM product_suppliers WHERE id = %s", (link_id,))
        res = cur.fetchone()
        if not res:
             raise HTTPException(status_code=404, detail="Link not found")
        product_id = res[0]

        # 2. Reset all links for this product to Not Preferred
        cur.execute("UPDATE product_suppliers SET is_preferred = FALSE WHERE product_id = %s", (product_id,))

        # 3. Set the target link to Preferred
        cur.execute("UPDATE product_suppliers SET is_preferred = TRUE WHERE id = %s", (link_id,))
        
        conn.commit()
        
        # --- AUDIT LOGGING ---
        create_audit_log(
            user=current_user,
            action="SET_PREFERRED_SUPPLIER",
            request=request,
            target_table="product_suppliers",
            target_id=link_id,
            details={"product_id": product_id, "preferred_link_id": link_id}
        )
        
        cur.close()
        
        return {"status": "success", "message": "Preferred supplier updated successfully"}
    except HTTPException as e:
        raise e
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# 1. Create a New Supplier (SECURED: Manager Only)
@router.post("/", response_model=SupplierOut)
def create_supplier(
    supplier: Supplier,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    sql = """
    INSERT INTO suppliers (name, location, contact_person, phone_number, email) 
    VALUES (%s, %s, %s, %s, %s) 
    RETURNING id, name, location, contact_person, phone_number, email, created_at;
    """
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        cur.execute(sql, (
            supplier.name, 
            supplier.location, 
            supplier.contact_person, 
            supplier.phone_number, 
            supplier.email
        ))
        new_supplier = cur.fetchone()
        conn.commit()
        
        new_supplier_id = new_supplier[0]
        
        # --- AUDIT LOGGING ---
        create_audit_log(
            user=current_user,
            action="CREATE_SUPPLIER",
            request=request,
            target_table="suppliers",
            target_id=new_supplier_id,
            details={"new_name": supplier.name}
        )
        
        cur.close()
        
        return SupplierOut(
            id=new_supplier[0],
            name=new_supplier[1],
            location=new_supplier[2],
            contact_person=new_supplier[3],
            phone_number=new_supplier[4],
            email=new_supplier[5],
            created_at=new_supplier[6]
        )
    except Exception as e:
        if conn:
            conn.rollback()
        if "unique constraint" in str(e):
            raise HTTPException(status_code=409, detail="A supplier with this name or email already exists.")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# 2. Get All Suppliers (PUBLIC)
@router.get("/", response_model=List[SupplierOut])
def get_all_suppliers():
    # Public endpoint
    conn = None
    sql = "SELECT id, name, location, contact_person, phone_number, email, created_at FROM suppliers ORDER BY name ASC"
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(sql)
        suppliers = cur.fetchall()
        cur.close()
        
        suppliers_list = []
        for s in suppliers:
            suppliers_list.append(SupplierOut(
                id=s[0],
                name=s[1],
                location=s[2],
                contact_person=s[3],
                phone_number=s[4],
                email=s[5],
                created_at=s[6]
            ))
        return suppliers_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# 3. Get a Single Supplier by ID (PUBLIC)
@router.get("/{supplier_id}", response_model=SupplierOut)
def get_supplier_by_id(supplier_id: int):
    # Public endpoint
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, name, location, contact_person, phone_number, email, created_at FROM suppliers WHERE id = %s", (supplier_id,))
        s = cur.fetchone()
        cur.close()
        
        if not s:
            raise HTTPException(status_code=404, detail="Supplier not found")
            
        return SupplierOut(
            id=s[0],
            name=s[1],
            location=s[2],
            contact_person=s[3],
            phone_number=s[4],
            email=s[5],
            created_at=s[6]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# 4. Update a Supplier (SECURED: Manager Only)
@router.put("/{supplier_id}", response_model=SupplierOut)
def update_supplier(
    supplier_id: int,
    supplier: Supplier,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    sql = """
    UPDATE suppliers 
    SET name = %s, location = %s, contact_person = %s, phone_number = %s, email = %s 
    WHERE id = %s 
    RETURNING id, name, location, contact_person, phone_number, email, created_at;
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(sql, (
            supplier.name, 
            supplier.location, 
            supplier.contact_person, 
            supplier.phone_number, 
            supplier.email, 
            supplier_id
        ))
        updated_s = cur.fetchone()
        
        if updated_s is None:
            raise HTTPException(status_code=404, detail="Supplier not found")
        
        conn.commit()
        
        # --- AUDIT LOGGING ---
        create_audit_log(
            user=current_user,
            action="UPDATE_SUPPLIER",
            request=request,
            target_table="suppliers",
            target_id=supplier_id,
            details={"new_name": supplier.name}
        )
        
        cur.close()
        
        return SupplierOut(
            id=updated_s[0],
            name=updated_s[1],
            location=updated_s[2],
            contact_person=updated_s[3],
            phone_number=updated_s[4],
            email=updated_s[5],
            created_at=updated_s[6]
        )
    except Exception as e:
        if conn:
            conn.rollback()
        if "unique constraint" in str(e):
            raise HTTPException(status_code=409, detail="A supplier with this name or email already exists.")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# 5. Delete a Supplier (SECURED: IT Admin Only)
@router.delete("/{supplier_id}")
def delete_supplier(
    supplier_id: int,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM suppliers WHERE id = %s RETURNING id, name", (supplier_id,))
        deleted_row = cur.fetchone()
        
        if deleted_row is None:
            raise HTTPException(status_code=404, detail="Supplier not found")
            
        conn.commit()
        
        # --- AUDIT LOGGING ---
        create_audit_log(
            user=current_user,
            action="DELETE_SUPPLIER",
            request=request,
            target_table="suppliers",
            target_id=deleted_row[0],
            details={"deleted_name": deleted_row[1]}
        )
        
        cur.close()
        
        return {"status": "success", "message": "Supplier deleted successfully"}
    except HTTPException as e:
        raise e
    except Exception as e:
        if conn:
            conn.rollback()
        # This will catch our "ON DELETE RESTRICT" error from the products table
        if "foreign key constraint" in str(e):
            raise HTTPException(status_code=400, detail="Cannot delete supplier: it is still linked to products.")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
@router.get("/product/{product_id}")
def get_suppliers_for_product(
    product_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Returns only the suppliers linked to a specific product via the 'product_suppliers' table.
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        query = """
            SELECT 
                s.id, 
                s.name, 
                ps.supply_price as cost,
                ps.is_preferred,
                ps.id as link_id
            FROM suppliers s
            JOIN product_suppliers ps ON s.id = ps.supplier_id
            WHERE ps.product_id = %s
            ORDER BY ps.is_preferred DESC, s.name ASC
        """
        cur.execute(query, (product_id,))
        rows = cur.fetchall()
        
        return [
            {
                "id": row[0],
                "name": row[1],
                "cost": float(row[2]) if row[2] else 0,
                "is_preferred": row[3],
                "link_id": row[4]
            }
            for row in rows
        ]
    except Exception as e:
        print(f"Error fetching product suppliers: {e}")
        raise HTTPException(500, str(e))
    finally:
        conn.close()

        