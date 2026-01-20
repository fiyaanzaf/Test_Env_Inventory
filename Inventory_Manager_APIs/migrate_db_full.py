import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# Configuration
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

def get_db_connection():
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT
        )
        return conn
    except Exception as e:
        print(f" Connection Failed: {e}")
        exit(1)

def column_exists(cur, table, column):
    cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name='{table}' AND column_name='{column}'")
    return cur.fetchone() is not None

def table_exists(cur, table):
    cur.execute(f"SELECT to_regclass('{table}');")
    return cur.fetchone()[0] is not None

def run_migration():
    conn = get_db_connection()
    cur = conn.cursor()
    print(" Starting MASTER MIGRATION (Final Version)...")

    try:
        # ====================================================
        # PHASE 0: CREATE MISSING TABLES
        # ====================================================
        print("\n0  Creating Missing Tables...")

        if not table_exists(cur, 'suppliers'):
            print("  Creating 'suppliers' table...")
            cur.execute("""
                CREATE TABLE suppliers (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    location TEXT,
                    contact_person VARCHAR(255),
                    phone_number VARCHAR(50),
                    email VARCHAR(255),
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            """)
        
        if not table_exists(cur, 'product_suppliers'):
            print("  Creating 'product_suppliers' table...")
            cur.execute("""
                CREATE TABLE product_suppliers (
                    id SERIAL PRIMARY KEY,
                    product_id INT REFERENCES products(id) ON DELETE CASCADE,
                    supplier_id INT REFERENCES suppliers(id) ON DELETE CASCADE,
                    supply_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                    supplier_sku VARCHAR(100),
                    is_preferred BOOLEAN DEFAULT FALSE,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(product_id, supplier_id)
                );
            """)

        # ====================================================
        # PHASE 1: STANDARDIZE COLUMN NAMES
        # ====================================================
        print("\n1  Standardizing Column Names...")

        # Products
        if column_exists(cur, 'products', 'price') and not column_exists(cur, 'products', 'selling_price'):
            cur.execute("ALTER TABLE products RENAME COLUMN price TO selling_price;")
            print("   Products: Renamed 'price' -> 'selling_price'")
        
        # Inventory
        if column_exists(cur, 'inventory_batches', 'cost_price') and not column_exists(cur, 'inventory_batches', 'unit_cost'):
            cur.execute("ALTER TABLE inventory_batches RENAME COLUMN cost_price TO unit_cost;")
            print("   Inventory: Renamed 'cost_price' -> 'unit_cost'")

        # Sales
        if column_exists(cur, 'sales_order_items', 'price_at_sale') and not column_exists(cur, 'sales_order_items', 'unit_price'):
            cur.execute("ALTER TABLE sales_order_items RENAME COLUMN price_at_sale TO unit_price;")
            print("   Sales: Renamed 'price_at_sale' -> 'unit_price'")

        # ====================================================
        # PHASE 2: ADD MISSING COLUMNS
        # ====================================================
        print("\n2  Ensuring Cost Columns Exist...")

        if not column_exists(cur, 'products', 'average_cost'):
            cur.execute("ALTER TABLE products ADD COLUMN average_cost DECIMAL(10, 2) DEFAULT 0.00;")
            print("   Products: Added 'average_cost' column.")
        
        if not column_exists(cur, 'sales_order_items', 'unit_cost'):
            cur.execute("ALTER TABLE sales_order_items ADD COLUMN unit_cost DECIMAL(10, 2);")
            print("   Sales: Added 'unit_cost' column.")

        # ====================================================
        # PHASE 2.5: SYNC LEGACY SUPPLIERS (New Step!)
        # ====================================================
        print("\n2.5 Syncing Legacy Suppliers...")
        # If products have a supplier_id, but no entry in product_suppliers, create one!
        cur.execute("""
            INSERT INTO product_suppliers (product_id, supplier_id, is_preferred)
            SELECT id, supplier_id, TRUE
            FROM products
            WHERE supplier_id IS NOT NULL
            AND id NOT IN (SELECT product_id FROM product_suppliers)
            ON CONFLICT DO NOTHING;
        """)
        print("   Created entries in 'product_suppliers' for existing product links.")

        # ====================================================
        # PHASE 3: SMART DATA POPULATION
        # ====================================================
        print("\n3  Populating Product Costs...")

        # Strategy A: Preferred Supplier
        cur.execute("""
            UPDATE products p
            SET average_cost = ps.supply_price
            FROM product_suppliers ps
            WHERE p.id = ps.product_id
            AND ps.is_preferred = TRUE
            AND ps.supply_price > 0;
        """)
        
        # Strategy B: Any Supplier
        cur.execute("""
            UPDATE products p
            SET average_cost = ps.supply_price
            FROM product_suppliers ps
            WHERE p.id = ps.product_id
            AND (p.average_cost IS NULL OR p.average_cost = 0)
            AND ps.supply_price > 0;
        """)
        
        # Strategy C: Fallback (70% Rule)
        cur.execute("""
            UPDATE products 
            SET average_cost = selling_price * 0.70 
            WHERE (average_cost IS NULL OR average_cost = 0)
            AND selling_price > 0;
        """)
        print("  Costs calculated (Preferred -> Any Supplier -> 70% Estimate).")

        # ====================================================
        # PHASE 4: BACKFILL SALES HISTORY
        # ====================================================
        print("\n4  Backfilling Sales History...")
        
        cur.execute("""
            UPDATE sales_order_items s
            SET unit_cost = p.average_cost
            FROM products p
            WHERE s.product_id = p.id
            AND (s.unit_cost IS NULL OR s.unit_cost = 0);
        """)
        print("   Sales history updated.")

        conn.commit()
        print("\n MIGRATION COMPLETE! Database is 100% ready.")

    except Exception as e:
        conn.rollback()
        print(f"\n CRITICAL ERROR: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    run_migration()