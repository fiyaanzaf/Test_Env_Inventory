import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database connection parameters
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

def run_migration():
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            host=DB_HOST,
            port=DB_PORT
        )
        cur = conn.cursor()
        
        migration_file = "migrations/fix_b2b_stock_trigger.sql"
        print(f"Reading migration file: {migration_file}...")
        
        with open(migration_file, "r") as f:
            sql_script = f.read()
            
        print("Executing migration...")
        cur.execute(sql_script)
        conn.commit()
        
        print("Migration executed successfully!")
        
        cur.close()
        conn.close()

    except Exception as e:
        print(f"Error running migration: {e}")

if __name__ == "__main__":
    # Ensure checking relative to this script
    current_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(current_dir)
    run_migration()
