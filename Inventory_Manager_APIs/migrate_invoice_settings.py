"""
Migration script for invoice settings
Run this to set up invoice generation capabilities
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS"),
        port=os.getenv("DB_PORT")
    )

def run_migration():
    conn = get_connection()
    cur = conn.cursor()
    
    try:
        # Read and execute the SQL migration
        with open('migrations/enhance_invoice_templates.sql', 'r') as f:
            sql = f.read()
        
        cur.execute(sql)
        conn.commit()
        print("✅ Invoice settings migration completed successfully!")
        
        # Verify
        cur.execute("SELECT COUNT(*) FROM system_settings WHERE key LIKE 'invoice_%' OR key LIKE 'bank_%' OR key LIKE 'business_%'")
        count = cur.fetchone()[0]
        print(f"   - {count} invoice-related settings configured")
        
        cur.execute("SELECT COUNT(*) FROM invoice_templates")
        templates = cur.fetchone()[0]
        print(f"   - {templates} invoice templates available")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    run_migration()
