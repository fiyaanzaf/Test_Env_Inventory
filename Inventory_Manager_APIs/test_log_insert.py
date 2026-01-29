
import os
import psycopg2
from dotenv import load_dotenv
import json

load_dotenv()

def test_insert():
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASS"),
            host=os.getenv("DB_HOST", "localhost"),
            port=os.getenv("DB_PORT", "5432")
        )
        cur = conn.cursor()
        
        print(f"Connected to DB. Testing insert into operations_log...")
        
        # operations_log schema:
        # user_id, username, operation_type, sub_type, target_id, quantity, reason, file_name, details, ip_address
        
        sql = """
            INSERT INTO operations_log 
            (user_id, username, operation_type, sub_type, target_id, quantity, reason, file_name, details, ip_address)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
        """
        
        # Using dummy data matching what inventory.py sends
        # user_id=1 (assuming admin/existing user), username='test_user'
        data = (
            1, 
            'test_user', 
            'transfer', 
            None, 
            1, # target_id (product_id)
            10, # quantity
            'Test Transfer Log', 
            None, 
            json.dumps({"from": "Store", "to": "Warehouse"}), 
            '127.0.0.1'
        )
        
        cur.execute(sql, data)
        new_id = cur.fetchone()[0]
        conn.commit()
        
        print(f"Successfully inserted operations_log ID: {new_id}")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"INSERT FAILED: {e}")

if __name__ == "__main__":
    test_insert()
