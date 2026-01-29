import psycopg2
import re
import os
from dotenv import load_dotenv

load_dotenv()

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

def restore_cancelled_order_alerts():
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

        print("Scanning for 'ADDED TO ORDER' alerts linked to CANCELLED orders...")

        # Find alerts that refer to a Purchase Order that is currently in 'cancelled' status
        query = """
            SELECT sa.id, sa.message, po.id, po.status
            FROM system_alerts sa
            JOIN purchase_orders po ON sa.message LIKE '%' || 'Purchase Order #' || po.id || '%'
            WHERE sa.status = 'active'
            AND sa.message LIKE '%ADDED TO ORDER%'
            AND po.status = 'cancelled'
        """
        
        cur.execute(query)
        rows = cur.fetchall()

        restored_count = 0

        for row in rows:
            alert_id, message, po_id, po_status = row
            
            # Extract Product Name from message
            # Format: 'ADDED TO ORDER: Unknown Product has been added to Purchase Order #16' 
            p_name_match = re.search(r"ADDED TO ORDER:\s*(.+?)\s*has be", message)
            product_name = p_name_match.group(1) if p_name_match else "Unknown Product"
            
            print(f"Restoring alert {alert_id} for '{product_name}' (Linked to Cancelled PO #{po_id})")

            # Update to LOW STOCK
            new_message = f"LOW STOCK: '{product_name}' is running low (Order Cancelled). Check stock."
            
            cur.execute("""
                UPDATE system_alerts 
                SET message = %s,
                    severity = 'critical',
                    created_at = NOW()
                WHERE id = %s
            """, (new_message, alert_id))
            
            restored_count += 1
            
        conn.commit()
        print(f"Successfully restored {restored_count} alerts linked to cancelled orders.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        if conn: conn.close()

if __name__ == "__main__":
    restore_cancelled_order_alerts()
