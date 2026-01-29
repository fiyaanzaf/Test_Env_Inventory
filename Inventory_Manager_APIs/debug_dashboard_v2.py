
import os
import psycopg2
from dotenv import load_dotenv
from datetime import date

load_dotenv()

def debug_today():
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASS"),
            host=os.getenv("DB_HOST", "localhost"),
            port=os.getenv("DB_PORT", "5432")
        )
        cur = conn.cursor()
        
        print(f"Checking for Date: {date.today()}")
        
        # 1. SALES TODAY
        print("\n--- SALES TODAY ---")
        cur.execute("""
            SELECT id, order_timestamp, total_amount, user_id 
            FROM sales_orders 
            WHERE DATE(order_timestamp) = CURRENT_DATE
        """)
        sales = cur.fetchall()
        print(f"Count: {len(sales)}")
        for s in sales:
            print(f"Sale ID: {s[0]}, Time: {s[1]}, UserID (Customer): {s[3]}")
            
        # 2. TRANSFERS TODAY
        print("\n--- TRANSFERS TODAY ---")
        cur.execute("""
            SELECT id, user_id, username, created_at, operation_type 
            FROM operations_log 
            WHERE DATE(created_at) = CURRENT_DATE
            AND operation_type = 'transfer'
        """)
        transfers = cur.fetchall()
        print(f"Count: {len(transfers)}")
        for t in transfers:
            print(f"Log ID: {t[0]}, UserID: {t[1]}, User: {t[2]}, Time: {t[3]}")

        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug_today()
