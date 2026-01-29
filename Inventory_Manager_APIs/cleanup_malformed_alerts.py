import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

def cleanup_alerts():
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

        # Logic: Find active "LOW STOCK" alerts that do NOT start with a quote after the prefix
        # Malformed: "LOW STOCK: Product Name is running low..."
        # Correct:   "LOW STOCK: 'Product Name' has only..."
        
        print("Scaning for malformed alerts...")
        
        # We look for messages starting with "LOW STOCK:" but the next character is NOT a single quote
        query = """
            UPDATE system_alerts
            SET status = 'resolved', 
                is_resolved = TRUE
            WHERE status = 'active' 
            AND message LIKE 'LOW STOCK:%' 
            AND message NOT LIKE 'LOW STOCK: ''%'
            RETURNING id, message;
        """
        
        cur.execute(query)
        resolved_rows = cur.fetchall()
        
        conn.commit()
        
        if resolved_rows:
            print(f"Successfully cleaned up {len(resolved_rows)} malformed alerts:")
            for row in resolved_rows:
                print(f" - [ID {row[0]}] {row[1]}")
        else:
            print("No malformed alerts found.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if conn: conn.close()

if __name__ == "__main__":
    cleanup_alerts()
