from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Annotated, List, Optional
import psycopg2
import os
from dotenv import load_dotenv
from datetime import datetime

# --- Security Imports ---
from security import get_current_user, check_role, User, get_db_connection

router = APIRouter(
    prefix="/api/v1/products",
    tags=["Products"]
)

# --- Load Environment Variables ---
load_dotenv()
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

# --- Pydantic Data Models ---

# Input model
class Product(BaseModel):
    sku: str
    name: str
    selling_price: float        # <--- Renamed from 'price'
    average_cost: float = 0.0   # <--- Added to track internal cost
    supplier_id: int            # The primary supplier to link initially
    category: Optional[str] = None
    unit_of_measure: Optional[str] = None
    low_stock_threshold: int = 20        # Per-product low stock alert threshold
    shelf_restock_threshold: int = 5     # Per-product shelf restock alert threshold

# Output model
class ProductOut(BaseModel):
    id: int
    sku: str
    name: str
    selling_price: float        # <--- Renamed
    average_cost: float         # <--- Added
    supplier_id: Optional[int]
    supplier_name: Optional[str] = None
    created_at: datetime
    category: Optional[str]
    unit_of_measure: Optional[str]
    total_quantity: int = 0
    low_stock_threshold: int = 20
    shelf_restock_threshold: int = 5

# --- API Endpoints ---

# 1. Create Product (Manager Only)
@router.post("/", response_model=ProductOut)
def create_product(
    product: Product, 
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    print(f"Product being created by user: {current_user.username}")
    conn = None
    
    # 1. Insert into Products Table
    sql_product = """
    INSERT INTO products (sku, name, selling_price, average_cost, supplier_id, category, unit_of_measure, low_stock_threshold, shelf_restock_threshold) 
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) 
    RETURNING id, sku, name, selling_price, average_cost, supplier_id, created_at, category, unit_of_measure, low_stock_threshold, shelf_restock_threshold;
    """

    # 2. Insert into Product_Suppliers Table (The Multi-Supplier Link)
    sql_link = """
    INSERT INTO product_suppliers (product_id, supplier_id, supply_price, is_preferred)
    VALUES (%s, %s, %s, TRUE)
    ON CONFLICT (product_id, supplier_id) DO NOTHING;
    """
    
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        
        # A. Create Product
        cur.execute(
            sql_product,
            (
                product.sku, 
                product.name, 
                product.selling_price, 
                product.average_cost,
                product.supplier_id, # Keeping legacy column populated for safety
                product.category, 
                product.unit_of_measure,
                product.low_stock_threshold,
                product.shelf_restock_threshold
            )
        )
        new_product = cur.fetchone()
        new_product_id = new_product[0]

        # B. Create Supplier Link
        cur.execute(sql_link, (new_product_id, product.supplier_id, product.average_cost))

        conn.commit()
        
        # Fetch Supplier Name for response
        cur.execute("SELECT name FROM suppliers WHERE id = %s", (product.supplier_id,))
        res = cur.fetchone()
        supplier_name = res[0] if res else "Unknown"

        cur.close()
        
        return ProductOut(
            id=new_product[0],
            sku=new_product[1],
            name=new_product[2],
            selling_price=float(new_product[3]),
            average_cost=float(new_product[4]),
            supplier_id=new_product[5],
            created_at=new_product[6],
            category=new_product[7],
            unit_of_measure=new_product[8],
            low_stock_threshold=new_product[9],
            shelf_restock_threshold=new_product[10],
            supplier_name=supplier_name,
            total_quantity=0 
        )
    except Exception as e:
        if conn: conn.rollback()
        if "foreign key constraint" in str(e):
            raise HTTPException(status_code=400, detail="Invalid supplier_id. Make sure it exists.")
        if "unique constraint" in str(e):
            raise HTTPException(status_code=409, detail=f"Product with SKU '{product.sku}' already exists.")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# 2. Get All Products (UPDATED: Joins via product_suppliers)
@router.get("/", response_model=List[ProductOut])
def get_all_products():
    conn = None
    
    # Logic:
    # 1. Join product_suppliers where is_preferred=TRUE to get the main supplier.
    # 2. Sum inventory_batches to get total quantity.
    
    sql = """
    SELECT 
        p.id, p.sku, p.name, p.selling_price, p.average_cost, 
        p.created_at, p.category, p.unit_of_measure,
        ps.supplier_id, s.name as supplier_name,
        COALESCE(SUM(ib.quantity), 0) as total_quantity,
        p.low_stock_threshold, p.shelf_restock_threshold
    FROM products p
    LEFT JOIN product_suppliers ps ON p.id = ps.product_id AND ps.is_preferred = TRUE
    LEFT JOIN suppliers s ON ps.supplier_id = s.id
    LEFT JOIN inventory_batches ib ON p.id = ib.product_id
    GROUP BY p.id, ps.supplier_id, s.name
    ORDER BY p.id ASC
    """
    
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        cur.execute(sql)
        products = cur.fetchall()
        cur.close()
        
        if not products:
            return []
        
        products_list = []
        for row in products:
            # Handle case where no supplier is linked yet
            sup_id = row[8] 
            sup_name = row[9]

            products_list.append(ProductOut(
                id=row[0],
                sku=row[1],
                name=row[2],
                selling_price=float(row[3] or 0),
                average_cost=float(row[4] or 0),
                created_at=row[5],
                category=row[6],
                unit_of_measure=row[7],
                supplier_id=sup_id,
                supplier_name=sup_name,
                total_quantity=int(row[10]),
                low_stock_threshold=row[11],
                shelf_restock_threshold=row[12]
            ))
            
        return products_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# 3. Update Product (Manager Only)
@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int, 
    product: Product,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    print(f"Product {product_id} updated by: {current_user.username}")
    conn = None
    
    # 1. Update basic fields
    sql_update = """
    UPDATE products
    SET 
        sku = %s, 
        name = %s, 
        selling_price = %s, 
        average_cost = %s,
        category = %s, 
        unit_of_measure = %s,
        low_stock_threshold = %s,
        shelf_restock_threshold = %s
    WHERE id = %s
    RETURNING id, sku, name, selling_price, average_cost, created_at, category, unit_of_measure, low_stock_threshold, shelf_restock_threshold;
    """
    
    # 2. Update Supplier Link (Upsert Logic)
    sql_upsert_supplier = """
    INSERT INTO product_suppliers (product_id, supplier_id, supply_price, is_preferred)
    VALUES (%s, %s, %s, TRUE)
    ON CONFLICT (product_id, supplier_id) 
    DO UPDATE SET is_preferred = TRUE; 
    """
    
    # 3. Reset other suppliers to not preferred (if switching)
    sql_reset_others = """
    UPDATE product_suppliers 
    SET is_preferred = FALSE 
    WHERE product_id = %s AND supplier_id != %s;
    """
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # A. Update Product
        cur.execute(
            sql_update,
            (
                product.sku, 
                product.name, 
                product.selling_price, 
                product.average_cost,
                product.category, 
                product.unit_of_measure,
                product.low_stock_threshold,
                product.shelf_restock_threshold,
                product_id
            )
        )
        updated_product = cur.fetchone()
        
        if updated_product is None:
            raise HTTPException(status_code=404, detail="Product not found")
        
        # B. Handle Supplier Switch
        # Reset others
        cur.execute(sql_reset_others, (product_id, product.supplier_id))
        # Set new/current as preferred
        cur.execute(sql_upsert_supplier, (product_id, product.supplier_id, product.average_cost))
        
        # C. Get Total Quantity & Supplier Name
        cur.execute("SELECT COALESCE(SUM(quantity), 0) FROM inventory_batches WHERE product_id = %s", (product_id,))
        qty_res = cur.fetchone()
        current_qty = int(qty_res[0]) if qty_res else 0

        cur.execute("SELECT name FROM suppliers WHERE id = %s", (product.supplier_id,))
        sup_res = cur.fetchone()
        sup_name = sup_res[0] if sup_res else None

        conn.commit()
        cur.close()
        
        return ProductOut(
            id=updated_product[0],
            sku=updated_product[1],
            name=updated_product[2],
            selling_price=float(updated_product[3]),
            average_cost=float(updated_product[4]),
            created_at=updated_product[5],
            category=updated_product[6],
            unit_of_measure=updated_product[7],
            low_stock_threshold=updated_product[8],
            shelf_restock_threshold=updated_product[9],
            supplier_id=product.supplier_id,
            supplier_name=sup_name,
            total_quantity=current_qty
        )
    except Exception as e:
        if conn: conn.rollback()
        if "foreign key constraint" in str(e):
            raise HTTPException(status_code=400, detail="Invalid supplier_id.")
        if "unique constraint" in str(e):
            raise HTTPException(status_code=409, detail=f"Product with SKU '{product.sku}' already exists.")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# 4. Delete Product (IT Admin Only)
@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    print(f"Product {product_id} DELETED by: {current_user.username}")
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        cur.execute("DELETE FROM products WHERE id = %s RETURNING id;", (product_id,))
        deleted_row = cur.fetchone()
        
        if deleted_row is None:
            raise HTTPException(status_code=404, detail="Product not found")

        conn.commit()
        cur.close()
        
        return {
            "status": "success",
            "message": f"Product with id {product_id} deleted successfully"
        }

    except Exception as e:
        if conn: conn.rollback()
        if "foreign key constraint" in str(e): 
            raise HTTPException(status_code=400, detail="Cannot delete product: It is linked to sales or inventory.")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# 5. Get Single Product by ID (Public) - Updated
@router.get("/{product_id}", response_model=ProductOut)
def get_product_by_id(product_id: int):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        sql = """
        SELECT 
            p.id, p.sku, p.name, p.selling_price, p.average_cost, 
            p.created_at, p.category, p.unit_of_measure,
            ps.supplier_id, s.name as supplier_name,
            COALESCE(SUM(ib.quantity), 0) as total_quantity,
            p.low_stock_threshold, p.shelf_restock_threshold
        FROM products p
        LEFT JOIN product_suppliers ps ON p.id = ps.product_id AND ps.is_preferred = TRUE
        LEFT JOIN suppliers s ON ps.supplier_id = s.id
        LEFT JOIN inventory_batches ib ON p.id = ib.product_id
        WHERE p.id = %s
        GROUP BY p.id, ps.supplier_id, s.name
        """
        
        cur.execute(sql, (product_id,))
        row = cur.fetchone()
        cur.close()
        
        if not row:
            raise HTTPException(status_code=404, detail="Product not found")
        
        return ProductOut(
            id=row[0],
            sku=row[1],
            name=row[2],
            selling_price=float(row[3] or 0),
            average_cost=float(row[4] or 0),
            created_at=row[5],
            category=row[6],
            unit_of_measure=row[7],
            supplier_id=row[8],
            supplier_name=row[9],
            total_quantity=int(row[10]),
            low_stock_threshold=row[11],
            shelf_restock_threshold=row[12]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# 6. Get Product by SKU (Employee+) - Updated
@router.get("/sku/{product_sku}", response_model=ProductOut)
def get_product_by_sku(
    product_sku: str,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        sql = """
        SELECT 
            p.id, p.sku, p.name, p.selling_price, p.average_cost, 
            p.created_at, p.category, p.unit_of_measure,
            ps.supplier_id, s.name as supplier_name,
            COALESCE(SUM(ib.quantity), 0) as total_quantity,
            p.low_stock_threshold, p.shelf_restock_threshold
        FROM products p
        LEFT JOIN product_suppliers ps ON p.id = ps.product_id AND ps.is_preferred = TRUE
        LEFT JOIN suppliers s ON ps.supplier_id = s.id
        LEFT JOIN inventory_batches ib ON p.id = ib.product_id
        WHERE p.sku = %s
        GROUP BY p.id, ps.supplier_id, s.name
        """
        
        cur.execute(sql, (product_sku,))
        row = cur.fetchone()
        cur.close()
        
        if not row:
            raise HTTPException(status_code=404, detail=f"Product with SKU '{product_sku}' not found")
        
        return ProductOut(
            id=row[0],
            sku=row[1],
            name=row[2],
            selling_price=float(row[3] or 0),
            average_cost=float(row[4] or 0),
            created_at=row[5],
            category=row[6],
            unit_of_measure=row[7],
            supplier_id=row[8],
            supplier_name=row[9],
            total_quantity=int(row[10]),
            low_stock_threshold=row[11],
            shelf_restock_threshold=row[12]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()