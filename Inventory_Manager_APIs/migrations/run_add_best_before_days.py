"""
Migration: Add best_before_days column to products table
Run: python migrations/run_add_best_before_days.py
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def run_migration():
    conn = None
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASS"),
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT"),
        )
        cur = conn.cursor()

        # Check if column already exists
        cur.execute("""
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'products' AND column_name = 'best_before_days'
        """)

        if cur.fetchone():
            print("[OK] Column 'best_before_days' already exists. Nothing to do.")
        else:
            cur.execute("ALTER TABLE products ADD COLUMN best_before_days INTEGER DEFAULT NULL;")
            conn.commit()
            print("[OK] Column 'best_before_days' added to products table successfully.")

        cur.close()
    except Exception as e:
        print(f"[ERROR] Migration failed: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    run_migration()
