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

def restore_stuck_alerts():
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

        print("Scanning for stuck 'ADDED TO ORDER' alerts...")

        # 1. Get all active 'ADDED TO ORDER' alerts
        cur.execute("""
            SELECT id, message 
            FROM system_alerts 
            WHERE status = 'active' 
            AND message LIKE '%ADDED TO ORDER%'
        """)
        alerts = cur.fetchall()

        restored_count = 0

        for alert in alerts:
            alert_id = alert[0]
            message = alert[1]

            # Extract PO ID from message: "...Purchase Order #123..."
            match = re.search(r"Purchase Order #(\d+)", message)
            if not match:
                continue

            po_id = int(match.group(1))

            # Check if this PO exists
            cur.execute("SELECT id FROM purchase_orders WHERE id = %s", (po_id,))
            if cur.fetchone():
                # PO exists, this alert is valid. Skip.
                continue
            
            # PO does NOT exist. This alert is stuck.
            # Extract Product Name: "ADDED TO ORDER: Product Name has been..."
            # Adjust regex based on expected format.
            # Format: 'ADDED TO ORDER: Unknown Product has been added to Purchase Order #16' 
            # Or: 'ADDED TO ORDER: Cheddar Cheese has been...'
            
            p_name_match = re.search(r"ADDED TO ORDER:\s*(.+?)\s*has be", message)
            product_name = p_name_match.group(1) if p_name_match else "Unknown Product"

            print(f"Restoring orphaned alert {alert_id} for product '{product_name}' (PO #{po_id} missing)")

            # Update to LOW STOCK
            # We don't have exact stock count here easily without looking up product ID by name, 
            # so we'll just say "Check Stock".
            new_message = f"LOW STOCK: '{product_name}' is running low (Restored). Check stock."

            cur.execute("""
                UPDATE system_alerts 
                SET message = %s,
                    severity = 'critical',
                    created_at = NOW()
                WHERE id = %s
            """, (new_message, alert_id))
            
            restored_count += 1

        conn.commit()
        print(f"Successfully restored {restored_count} stuck alerts.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        if conn: conn.close()

if __name__ == "__main__":
    restore_stuck_alerts()
