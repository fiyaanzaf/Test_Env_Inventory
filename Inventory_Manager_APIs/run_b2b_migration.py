"""
Run B2B & Khata Migration
Execute this script to create all B2B/Khata tables in the database.
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
        with open("migrations/create_b2b_khata_tables.sql", "r", encoding="utf-8") as f:
            sql = f.read()
        
        print("Executing migration...")
        cur.execute(sql)
        
        print("\n✅ Migration completed successfully!")
        print("\nTables created:")
        
        # Verify tables were created
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name LIKE 'b2b%' OR table_name = 'client_item_history'
            ORDER BY table_name;
        """)
        tables = cur.fetchall()
        for t in tables:
            print(f"  ✓ {t[0]}")
        
        # Check views
        cur.execute("""
            SELECT table_name 
            FROM information_schema.views 
            WHERE table_schema = 'public' 
            AND table_name LIKE 'v_b2b%' OR table_name = 'v_top%'
            ORDER BY table_name;
        """)
        views = cur.fetchall()
        print("\nViews created:")
        for v in views:
            print(f"  ✓ {v[0]}")
            
        cur.close()
        
    except Exception as e:
        print(f"\n❌ Error running migration: {e}")
        raise
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    run_migration()
