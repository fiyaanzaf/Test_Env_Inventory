
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def debug_activity_query():
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASS"),
            host=os.getenv("DB_HOST", "localhost"),
            port=os.getenv("DB_PORT", "5432")
        )
        cur = conn.cursor()
        
        user_id = 1 # Assuming ID 1 exists
        limit = 10
        
        print(f"Testing Query with user_id={user_id}...")
        
        # Exact query from employee.py
        sql = """
            (
                SELECT 
                    ol.id,
                    ol.operation_type as type,
                    ol.reason as description,
                    ol.created_at as timestamp,
                    ol.quantity
                FROM operations_log ol
                WHERE ol.user_id = %s
                AND ol.operation_type IN ('transfer', 'receive', 'bulk_receive', 'write_off')
                ORDER BY ol.created_at DESC
                LIMIT %s
            )
            ORDER BY timestamp DESC
            LIMIT %s
        """
        
        cur.execute(sql, (user_id, limit, limit))
        rows = cur.fetchall()
        print("Query Successful!")
        print(f"Rows found: {len(rows)}")
        for r in rows:
            print(r)
            
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"\nQUERY FAILED:\n{e}")

if __name__ == "__main__":
    debug_activity_query()
