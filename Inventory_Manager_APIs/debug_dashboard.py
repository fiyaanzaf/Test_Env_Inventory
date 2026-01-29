
import os
import sys
from datetime import datetime, date
from dotenv import load_dotenv
import psycopg2
from decimal import Decimal

# Load environment variables
load_dotenv()
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

def get_db_connection():
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            host=DB_HOST,
            port=DB_PORT
        )
        return conn
    except Exception as e:
        print(f"Error connecting to database: {e}")
        return None

def debug_queries():
    conn = get_db_connection()
    if not conn:
        return

    cur = conn.cursor()
    print("--- DEBUGGING DASHBOARD DATE/TIME ---")
    
    # 1. Check DB Time
    cur.execute("SELECT NOW(), CURRENT_DATE, CURRENT_TIME;")
    row = cur.fetchone()
    print(f"DB NOW: {row[0]}")
    print(f"DB CURRENT_DATE: {row[1]}")
    print(f"DB CURRENT_TIME: {row[2]}")
    
    print("\n--- RECENT SALES ORDERS (Last 5) ---")
    cur.execute("""
        SELECT id, order_timestamp, total_amount, sales_channel 
        FROM sales_orders 
        ORDER BY order_timestamp DESC 
        LIMIT 5
    """)
    rows = cur.fetchall()
    for r in rows:
        print(f"ID: {r[0]}, Time: {r[1]} (Type: {type(r[1])}), Amount: {r[2]}")

    print("\n--- SALES COUNT QUERY TEST ---")
    # Test the EXACT query we used
    cur.execute("""
        SELECT COUNT(*) 
        FROM sales_orders 
        WHERE DATE(order_timestamp) = CURRENT_DATE
    """)
    print(f"Count using CURRENT_DATE: {cur.fetchone()[0]}")
    
    print("\n--- RECENT OPERATIONS LOG (Last 5 Transfers) ---")
    cur.execute("""
        SELECT id, user_id, username, operation_type, created_at 
        FROM operations_log 
        WHERE operation_type = 'transfer'
        ORDER BY created_at DESC 
        LIMIT 5
    """)
    rows = cur.fetchall()
    if not rows:
        print("No transfers found in operations_log.")
    for r in rows:
        print(f"ID: {r[0]}, UserID: {r[1]}, User: {r[2]}, Time: {r[4]}")

    print("\n--- TRANSFERS QUERY TEST ---")
    # Test for ANY user
    cur.execute("""
        SELECT COUNT(*) 
        FROM operations_log 
        WHERE operation_type = 'transfer'
        AND DATE(created_at) = CURRENT_DATE
    """)
    print(f"Transfers count (ANY User) using CURRENT_DATE: {cur.fetchone()[0]}")
    
    conn.close()

if __name__ == "__main__":
    debug_queries()
