"""
Migration Script: Variant Tracking & Batch Tracking
====================================================
Creates new tables and adds FK columns to existing tables.
Safe to run multiple times (idempotent).
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")


def get_db_connection():
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD,
            host=DB_HOST, port=DB_PORT
        )
        return conn
    except Exception as e:
        print(f"Connection Failed: {e}")
        exit(1)


def table_exists(cur, table):
    cur.execute("SELECT to_regclass(%s);", (table,))
    return cur.fetchone()[0] is not None


def column_exists(cur, table, column):
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name=%s AND column_name=%s",
        (table, column)
    )
    return cur.fetchone() is not None


def run_migration():
    conn = get_db_connection()
    cur = conn.cursor()
    print("Starting Variant & Batch Tracking Migration...")

    try:
        # ====================================================
        # PHASE 1: CREATE product_variants TABLE
        # ====================================================
        if not table_exists(cur, 'product_variants'):
            print("\n[1/5] Creating 'product_variants' table...")
            cur.execute("""
                CREATE TABLE product_variants (
                    id SERIAL PRIMARY KEY,
                    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                    variant_name VARCHAR(255) NOT NULL,
                    variant_sku VARCHAR(100),
                    variant_barcode VARCHAR(100),
                    selling_price DECIMAL(10,2),
                    average_cost DECIMAL(10,2),
                    unit_of_measure VARCHAR(50),
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(product_id, variant_name)
                );
            """)
            print("  ✓ product_variants created.")
        else:
            print("[1/5] product_variants already exists — skipping.")

        # ====================================================
        # PHASE 2: CREATE batch_tracking TABLE
        # ====================================================
        if not table_exists(cur, 'batch_tracking'):
            print("\n[2/5] Creating 'batch_tracking' table...")
            cur.execute("""
                CREATE TABLE batch_tracking (
                    id SERIAL PRIMARY KEY,
                    batch_code VARCHAR(100) NOT NULL UNIQUE,
                    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                    variant_id INT REFERENCES product_variants(id) ON DELETE SET NULL,
                    supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
                    manufacturing_date DATE,
                    expiry_date DATE,
                    procurement_price DECIMAL(10,2),
                    state_of_origin VARCHAR(255),
                    batch_description TEXT,
                    po_id INT REFERENCES purchase_orders(id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    created_by VARCHAR(100)
                );
            """)
            print("  ✓ batch_tracking created.")
        else:
            print("[2/5] batch_tracking already exists — skipping.")

        # ====================================================
        # PHASE 3: ADD variant_id TO inventory_batches
        # ====================================================
        print("\n[3/5] Adding columns to inventory_batches...")

        if not column_exists(cur, 'inventory_batches', 'variant_id'):
            cur.execute("""
                ALTER TABLE inventory_batches
                ADD COLUMN variant_id INT REFERENCES product_variants(id) ON DELETE SET NULL;
            """)
            print("  ✓ Added variant_id to inventory_batches.")
        else:
            print("  • variant_id already exists — skipping.")

        if not column_exists(cur, 'inventory_batches', 'tracking_batch_id'):
            cur.execute("""
                ALTER TABLE inventory_batches
                ADD COLUMN tracking_batch_id INT REFERENCES batch_tracking(id) ON DELETE SET NULL;
            """)
            print("  ✓ Added tracking_batch_id to inventory_batches.")
        else:
            print("  • tracking_batch_id already exists — skipping.")

        # ====================================================
        # PHASE 4: ADD variant_id TO purchase_order_items
        # ====================================================
        print("\n[4/5] Adding variant_id to purchase_order_items...")

        if not column_exists(cur, 'purchase_order_items', 'variant_id'):
            cur.execute("""
                ALTER TABLE purchase_order_items
                ADD COLUMN variant_id INT REFERENCES product_variants(id) ON DELETE SET NULL;
            """)
            print("  ✓ Added variant_id to purchase_order_items.")
        else:
            print("  • variant_id already exists — skipping.")

        # ====================================================
        # PHASE 5: ADD variant_id TO sales_order_items
        # ====================================================
        print("\n[5/5] Adding variant_id to sales_order_items...")

        if not column_exists(cur, 'sales_order_items', 'variant_id'):
            cur.execute("""
                ALTER TABLE sales_order_items
                ADD COLUMN variant_id INT REFERENCES product_variants(id) ON DELETE SET NULL;
            """)
            print("  ✓ Added variant_id to sales_order_items.")
        else:
            print("  • variant_id already exists — skipping.")

        conn.commit()
        print("\n✅ MIGRATION COMPLETE! Variant & Batch Tracking tables are ready.")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ CRITICAL ERROR: {e}")
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    run_migration()
