"""
Run B2B Reverse Flow Migration
Execute this script to apply the reverse flow migration.
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

def run_migration():
    conn = None
    try:
        print("Connecting to database...")
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            host=DB_HOST,
            port=DB_PORT
        )
        conn.autocommit = True
        cur = conn.cursor()
        
        print("Reading migration file...")
        with open("migrations/update_b2b_reverse_flow.sql", "r", encoding="utf-8") as f:
            sql = f.read()
        
        print("Executing migration...")
        cur.execute(sql)
        
        print("\n✅ Migration completed successfully!")
        
        # Verify
        cur.execute("""
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'b2b_transactions' AND constraint_type = 'CHECK';
        """)
        constraints = cur.fetchall()
        print("\nConstraints verified:", constraints)

        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'b2b_purchases' OR table_name = 'b2b_purchase_items';
        """)
        tables = cur.fetchall()
        print("\nNew tables verified:", tables)
            
        cur.close()
        
    except Exception as e:
        print(f"\n❌ Error running migration: {e}")
        raise
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    run_migration()
