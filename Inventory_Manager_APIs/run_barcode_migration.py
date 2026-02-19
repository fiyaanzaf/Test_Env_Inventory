"""
Run this script to add the 'barcode' column to the products table.
This is required for the wireless scanner feature.

Usage:
    python run_barcode_migration.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from security import get_db_connection


def run_migration():
    """Execute the barcode column migration."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        print("Reading migration file...")
        migration_path = os.path.join(
            os.path.dirname(__file__),
            'migrations',
            'add_barcode_column.sql'
        )

        with open(migration_path, 'r', encoding='utf-8') as f:
            migration_sql = f.read()

        print("Executing migration...")
        cur.execute(migration_sql)
        conn.commit()
        print("[OK] Migration successful! 'barcode' column added to products table.")

        # Verify
        cur.execute("""
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'products' AND column_name = 'barcode'
        """)
        row = cur.fetchone()
        if row:
            print(f"   Column: {row[0]}, Type: {row[1]}, Default: {row[2]}")
        else:
            print("   [WARN] Column not found after migration -- check for errors.")

        cur.close()

    except Exception as e:
        print(f"\n[ERROR] Error running migration: {e}")
        if conn:
            conn.rollback()
        sys.exit(1)
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    run_migration()
