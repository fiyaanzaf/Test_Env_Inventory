"""
Migration: Goods Receipt Notes (GRN) + Supplier Invoices + QA Workflow
Creates 4 new tables: supplier_invoices, supplier_invoice_items, goods_receipt_notes, grn_items
Adds universal_barcode column to products table.
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")


def column_exists(cur, table, column):
    cur.execute("""
        SELECT 1 FROM information_schema.columns
        WHERE table_name = %s AND column_name = %s
    """, (table, column))
    return cur.fetchone() is not None


def table_exists(cur, table):
    cur.execute("""
        SELECT 1 FROM information_schema.tables
        WHERE table_name = %s
    """, (table,))
    return cur.fetchone() is not None


def run_migration():
    conn = psycopg2.connect(
        dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD,
        host=DB_HOST, port=DB_PORT
    )
    cur = conn.cursor()

    print("\n========================================")
    print("  GRN + QA Workflow Migration")
    print("========================================\n")

    try:
        # ============================================
        # TABLE 1: supplier_invoices
        # ============================================
        if not table_exists(cur, 'supplier_invoices'):
            print("[1/5] Creating 'supplier_invoices' table...")
            cur.execute("""
                CREATE TABLE supplier_invoices (
                    id SERIAL PRIMARY KEY,
                    po_id INT REFERENCES purchase_orders(id) ON DELETE SET NULL,
                    supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
                    invoice_number VARCHAR(100) NOT NULL,
                    invoice_date DATE,
                    received_date DATE DEFAULT CURRENT_DATE,
                    subtotal DECIMAL(12,2) DEFAULT 0,
                    tax_amount DECIMAL(12,2) DEFAULT 0,
                    total_amount DECIMAL(12,2) DEFAULT 0,
                    payment_status VARCHAR(20) DEFAULT 'unpaid',
                    payment_due_date DATE,
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    created_by VARCHAR(100)
                );
            """)
            print("  [OK] supplier_invoices created.")
        else:
            print("[1/5] supplier_invoices already exists - skipping.")

        # ============================================
        # TABLE 2: supplier_invoice_items
        # ============================================
        if not table_exists(cur, 'supplier_invoice_items'):
            print("[2/5] Creating 'supplier_invoice_items' table...")
            cur.execute("""
                CREATE TABLE supplier_invoice_items (
                    id SERIAL PRIMARY KEY,
                    invoice_id INT NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
                    po_item_id INT REFERENCES purchase_order_items(id) ON DELETE SET NULL,
                    product_id INT REFERENCES products(id) ON DELETE SET NULL,
                    variant_id INT REFERENCES product_variants(id) ON DELETE SET NULL,
                    product_name VARCHAR(255),
                    variant_name VARCHAR(255),
                    invoiced_qty INT DEFAULT 0,
                    unit_cost DECIMAL(10,2) DEFAULT 0,
                    line_total DECIMAL(12,2) DEFAULT 0,
                    hsn_code VARCHAR(20),
                    tax_rate DECIMAL(5,2) DEFAULT 0
                );
            """)
            print("  [OK] supplier_invoice_items created.")
        else:
            print("[2/5] supplier_invoice_items already exists - skipping.")

        # ============================================
        # TABLE 3: goods_receipt_notes
        # ============================================
        if not table_exists(cur, 'goods_receipt_notes'):
            print("[3/5] Creating 'goods_receipt_notes' table...")
            cur.execute("""
                CREATE TABLE goods_receipt_notes (
                    id SERIAL PRIMARY KEY,
                    po_id INT REFERENCES purchase_orders(id) ON DELETE SET NULL,
                    invoice_id INT REFERENCES supplier_invoices(id) ON DELETE SET NULL,
                    received_by VARCHAR(100),
                    status VARCHAR(20) DEFAULT 'scanning',
                    warehouse_id INT REFERENCES locations(id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMPTZ,
                    notes TEXT
                );
            """)
            print("  [OK] goods_receipt_notes created.")
        else:
            print("[3/5] goods_receipt_notes already exists - skipping.")

        # ============================================
        # TABLE 4: grn_items
        # ============================================
        if not table_exists(cur, 'grn_items'):
            print("[4/5] Creating 'grn_items' table...")
            cur.execute("""
                CREATE TABLE grn_items (
                    id SERIAL PRIMARY KEY,
                    grn_id INT NOT NULL REFERENCES goods_receipt_notes(id) ON DELETE CASCADE,
                    invoice_item_id INT REFERENCES supplier_invoice_items(id) ON DELETE SET NULL,
                    po_item_id INT REFERENCES purchase_order_items(id) ON DELETE SET NULL,
                    product_id INT REFERENCES products(id) ON DELETE SET NULL,
                    variant_id INT REFERENCES product_variants(id) ON DELETE SET NULL,
                    ordered_qty INT DEFAULT 0,
                    invoiced_qty INT DEFAULT 0,
                    received_qty INT DEFAULT 0,
                    unit_cost DECIMAL(10,2) DEFAULT 0,
                    universal_barcode VARCHAR(200),
                    internal_code VARCHAR(100),
                    qa_status VARCHAR(20) DEFAULT 'pending',
                    qa_notes TEXT,
                    scanned_at TIMESTAMPTZ
                );
            """)
            print("  [OK] grn_items created.")
        else:
            print("[4/5] grn_items already exists - skipping.")

        # ============================================
        # ADD universal_barcode to products
        # ============================================
        print("[5/5] Adding universal_barcode to products...")
        if not column_exists(cur, 'products', 'universal_barcode'):
            cur.execute("""
                ALTER TABLE products
                ADD COLUMN universal_barcode VARCHAR(200);
            """)
            print("  [OK] Added universal_barcode to products.")
        else:
            print("  - universal_barcode already exists - skipping.")

        conn.commit()
        print("\n[SUCCESS] Migration completed successfully!\n")

    except Exception as e:
        conn.rollback()
        print(f"\n[ERROR] Migration failed: {e}\n")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    run_migration()
