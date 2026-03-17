"""
Run batch tracking index migration.
Uses the same .env config as the main API server.
"""
import os
import sys
import psycopg2

# Load .env from parent directory (where the API server's .env lives)
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

INDEXES = [
    ("idx_batch_tracking_product_id", "CREATE INDEX IF NOT EXISTS idx_batch_tracking_product_id ON batch_tracking(product_id);"),
    ("idx_inventory_batches_tracking_batch_id", "CREATE INDEX IF NOT EXISTS idx_inventory_batches_tracking_batch_id ON inventory_batches(tracking_batch_id);"),
    ("idx_batch_tracking_batch_tag", "CREATE INDEX IF NOT EXISTS idx_batch_tracking_batch_tag ON batch_tracking(batch_tag);"),
    ("idx_batch_tracking_expiry_date", "CREATE INDEX IF NOT EXISTS idx_batch_tracking_expiry_date ON batch_tracking(expiry_date);"),
    ("idx_inventory_batches_product_id", "CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_id ON inventory_batches(product_id);"),
]

def main():
    print(f"Connecting to {DB_HOST}:{DB_PORT}/{DB_NAME} as {DB_USER}...")
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME, user=DB_USER, password=DB_PASS,
            host=DB_HOST, port=DB_PORT
        )
        cur = conn.cursor()
        
        for name, sql in INDEXES:
            print(f"  Creating index: {name} ...", end=" ")
            cur.execute(sql)
            print("OK")
        
        conn.commit()
        cur.close()
        conn.close()
        print("\n All 5 indexes created successfully!")
    except Exception as e:
        print(f"\n FAILED: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
