import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# Configuration
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

def get_db_connection():
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT
        )
        return conn
    except Exception as e:
        print(f" Connection Failed: {e}")
        exit(1)

def run_migration():
    conn = get_db_connection()
    cur = conn.cursor()
    print("Starting Cleanup Migration...")

    try:
        # Read the SQL file
        with open('migrations/rename_offensive_data.sql', 'r') as f:
            sql_commands = f.read()

        print("Executing SQL script...")
        cur.execute(sql_commands)
        
        conn.commit()
        print("Migration applied successfully!")
        
        # Verify the changes
        print("\nVerifying changes...")
        cur.execute("SELECT name FROM products WHERE name IN ('Goaman', 'child marraige', 'GAANJA', 'Dhobi');")
        rows = cur.fetchall()
        if len(rows) == 0:
            print(" - Products filtered successfully.")
        else:
            print(f" - WARNING: {len(rows)} offensive products still remaining.")

        cur.execute("SELECT name FROM suppliers WHERE name IN ('Goaman Supplier', 'Joy chomu', 'Gaanja');")
        rows = cur.fetchall()
        if len(rows) == 0:
            print(" - Suppliers filtered successfully.")
        else:
            print(f" - WARNING: {len(rows)} offensive suppliers still remaining.")

        cur.execute("SELECT name FROM locations WHERE name IN ('Goaman shemdu', 'Goaman-aisle', 'Joy _island', 'Weed_store');")
        rows = cur.fetchall()
        if len(rows) == 0:
            print(" - Locations filtered successfully.")
        else:
            print(f" - WARNING: {len(rows)} offensive locations still remaining.")

    except Exception as e:
        conn.rollback()
        print(f"\nCRITICAL ERROR: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    run_migration()
