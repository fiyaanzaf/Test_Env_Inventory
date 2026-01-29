import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

def cleanup_duplicates():
    conn = None
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            host=DB_HOST,
            port=DB_PORT
        )
        cur = conn.cursor()

        print("Scanning for duplicate or leftover 'ORDER' alerts...")
        
        # 1. Resolve any active "ADDED TO ORDER" alerts that refer to NON-EXISTENT Purchase Orders
        # (Where the PO might have been deleted but alert stayed)
        cur.execute("""
            UPDATE system_alerts
            SET status = 'resolved', is_resolved = TRUE
            WHERE status = 'active'
            AND message LIKE '%Purchase Order #%'
            AND NOT EXISTS (
                SELECT 1 FROM purchase_orders 
                WHERE status IN ('draft', 'placed')
                AND message LIKE '%' || id::text || '%'
            )
        """)
        print(f"cleaned up {cur.rowcount} orphaned 'Added to Order' alerts.")

        # 2. Resolve duplicates: If we have multiple active alerts for the same product, keep one.
        # This is a bit complex in SQL, so let's just resolve weird "Unknown Product" or generic ones.
        
        # Resolve 'Unknown Product' format again just in case
        cur.execute("""
            UPDATE system_alerts
            SET status = 'resolved', is_resolved = TRUE
            WHERE status = 'active'
            AND message LIKE 'LOW STOCK:%' 
            AND message NOT LIKE 'LOW STOCK: ''%'
        """)
        print(f"cleaned up {cur.rowcount} malformed 'Unknown Product' alerts.")

        conn.commit()
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if conn: conn.close()

if __name__ == "__main__":
    cleanup_duplicates()
