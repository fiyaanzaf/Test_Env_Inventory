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
        return psycopg2.connect(
            dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD, host=DB_HOST, port=DB_PORT
        )
    except Exception as e:
        print(f"Connection Failed: {e}")
        exit(1)

def fix_supply_prices():
    conn = get_db_connection()
    cur = conn.cursor()
    print("--- Starting SUPPLY PRICE REPAIR ---")

    try:
        # ====================================================
        # ESTIMATE SUPPLY PRICE BASED ON SELLING PRICE
        # ====================================================
        print("\n[1] Calculating Supply Prices...")
        
        # We assume Supply Price is 70% of Selling Price (40% Margin).
        # You can change '0.70' to whatever decimal you prefer.
        cur.execute("""
            UPDATE product_suppliers ps
            SET supply_price = p.selling_price * 0.70
            FROM products p
            WHERE ps.product_id = p.id
            AND (ps.supply_price IS NULL OR ps.supply_price = 0)
            AND p.selling_price > 0;
        """)
        
        rows_updated = cur.rowcount
        print(f"    > Success! Updated {rows_updated} supplier records with estimated prices.")

        # ====================================================
        # SYNC BACK TO MASTER PRODUCT COST
        # ====================================================
        print("\n[2] Syncing Product Master Costs...")
        
        # Now that suppliers have prices, ensure the main product table matches
        cur.execute("""
            UPDATE products p
            SET average_cost = ps.supply_price
            FROM product_suppliers ps
            WHERE p.id = ps.product_id
            AND ps.is_preferred = TRUE;
        """)
        print(f"    > Re-synced master 'average_cost' for {cur.rowcount} products.")

        conn.commit()
        print("\nSUCCESS: Supply prices repaired.")

    except Exception as e:
        conn.rollback()
        print(f"\nCRITICAL ERROR: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    fix_supply_prices()