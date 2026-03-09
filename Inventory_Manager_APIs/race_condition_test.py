"""
Race Condition Test - Inventory Manager
========================================
Tests whether concurrent sales orders can oversell inventory.

Scenario:
  A product has exactly 10 units in stock.
  10 threads simultaneously try to buy 3 units each (total demand = 30).
  Only 3 should succeed (3 x 3 = 9 <= 10). The 4th+ should be rejected.

  If the app has a race condition bug, more than 10 units will be sold,
  and inventory could go negative.

Usage:
  1. Make sure the API server is running on localhost:8000
  2. Run:  ./venv/Scripts/python race_condition_test.py
"""

import requests
import threading
import time
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# === CONFIG ===
BASE_URL = "http://localhost:8000"
API = f"{BASE_URL}/api/v1"
USERNAME = "test_owner"
PASSWORD = "test123"

# Test parameters
STOCK_TO_SET = 10        # We'll set exactly this much stock
UNITS_PER_ORDER = 3      # Each thread tries to buy this many
NUM_THREADS = 10         # Number of concurrent buyers

# === DB CONNECTION (to set up and verify stock) ===
def get_db():
    return psycopg2.connect(
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS"),
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432")
    )

# === STEP 1: Login ===
def login():
    resp = requests.post(f"{API}/users/login", data={
        "username": USERNAME,
        "password": PASSWORD
    })
    resp.raise_for_status()
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

# === STEP 2: Pick a product and set exact stock ===
def setup_test_product(headers):
    """Find a product with store location and set stock to exactly STOCK_TO_SET."""
    conn = get_db()
    cur = conn.cursor()
    
    # Find a product that has inventory
    cur.execute("""
        SELECT DISTINCT b.product_id, p.name, p.sku 
        FROM inventory_batches b 
        JOIN products p ON b.product_id = p.id
        WHERE b.quantity > 0
        LIMIT 1
    """)
    row = cur.fetchone()
    if not row:
        print("[FAIL] No products with stock found! Run seed_test_data.py first.")
        cur.close()
        conn.close()
        return None, None, None
    
    product_id, product_name, sku = row
    
    # Get the product's selling price
    cur.execute("SELECT selling_price FROM products WHERE id = %s", (product_id,))
    price_row = cur.fetchone()
    selling_price = float(price_row[0]) if price_row and price_row[0] else 100.0
    
    # Zero out ALL existing batches for this product
    cur.execute("UPDATE inventory_batches SET quantity = 0 WHERE product_id = %s", (product_id,))
    
    # Find or create a store location batch with exact stock
    cur.execute("SELECT id FROM locations WHERE location_type = 'store' LIMIT 1")
    store_loc = cur.fetchone()
    if not store_loc:
        print("[FAIL] No store location found!")
        cur.close()
        conn.close()
        return None, None, None
    
    store_loc_id = store_loc[0]
    
    # Set exact stock in one batch
    cur.execute("""
        INSERT INTO inventory_batches (product_id, location_id, batch_code, quantity, unit_cost, received_at)
        VALUES (%s, %s, 'RACE-TEST-BATCH', %s, 50.00, NOW())
        ON CONFLICT (product_id, location_id, batch_code)
        DO UPDATE SET quantity = %s
        RETURNING id
    """, (product_id, store_loc_id, STOCK_TO_SET, STOCK_TO_SET))
    
    batch_id = cur.fetchone()[0]
    conn.commit()
    
    # Verify
    cur.execute("SELECT SUM(quantity) FROM inventory_batches WHERE product_id = %s AND quantity > 0", (product_id,))
    actual_stock = cur.fetchone()[0]
    
    cur.close()
    conn.close()
    
    print("")
    print("=" * 60)
    print("  RACE CONDITION TEST SETUP")
    print("=" * 60)
    print(f"  Product:       {product_name} (ID: {product_id}, SKU: {sku})")
    print(f"  Stock set to:  {actual_stock} units (batch ID: {batch_id})")
    print(f"  Selling price: Rs.{selling_price}")
    print(f"  Each thread:   tries to buy {UNITS_PER_ORDER} units")
    print(f"  Threads:       {NUM_THREADS}")
    print(f"  Total demand:  {UNITS_PER_ORDER * NUM_THREADS} units")
    print(f"  Expected:      max {STOCK_TO_SET // UNITS_PER_ORDER} orders succeed")
    print("=" * 60)
    print("")
    
    return product_id, selling_price, batch_id

# === STEP 3: Concurrent sale attempt ===
results = {
    "success": [],
    "rejected": [],
    "errors": [],
    "lock": threading.Lock()
}

def attempt_sale(thread_id, product_id, price, headers):
    """Single thread attempting to create a sale order."""
    try:
        payload = {
            "customer_name": f"RaceTest-Thread-{thread_id}",
            "sales_channel": "in-store",
            "payment_method": "cash",
            "items": [{
                "product_id": product_id,
                "quantity": UNITS_PER_ORDER,
                "unit_price": price
            }]
        }
        
        resp = requests.post(
            f"{API}/sales/orders",
            json=payload,
            headers=headers,
            timeout=30
        )
        
        with results["lock"]:
            if resp.status_code == 200:
                order_data = resp.json()
                results["success"].append({
                    "thread": thread_id,
                    "order_id": order_data.get("id"),
                    "status_code": resp.status_code
                })
            else:
                results["rejected"].append({
                    "thread": thread_id,
                    "status_code": resp.status_code,
                    "detail": resp.json().get("detail", resp.text)
                })
    except Exception as e:
        with results["lock"]:
            results["errors"].append({
                "thread": thread_id,
                "error": str(e)
            })

# === STEP 4: Run the test ===
def run_test():
    print("[LOGIN] Logging in...")
    headers = login()
    print("[OK] Login successful")
    
    print("[SETUP] Setting up test product...")
    product_id, price, batch_id = setup_test_product(headers)
    if not product_id:
        return
    
    # Barrier to ensure all threads start at the EXACT same time
    barrier = threading.Barrier(NUM_THREADS)
    
    def thread_fn(tid):
        barrier.wait()  # All threads release simultaneously
        attempt_sale(tid, product_id, price, headers)
    
    print(f"[START] Launching {NUM_THREADS} simultaneous sale threads...")
    print("")
    
    threads = []
    start_time = time.time()
    
    for i in range(NUM_THREADS):
        t = threading.Thread(target=thread_fn, args=(i,))
        threads.append(t)
        t.start()
    
    for t in threads:
        t.join()
    
    elapsed = time.time() - start_time
    
    # === RESULTS ===
    print("")
    print("=" * 60)
    print(f"  RESULTS (completed in {elapsed:.2f}s)")
    print("=" * 60)
    print(f"  [OK] Successful orders: {len(results['success'])}")
    for s in results["success"]:
        print(f"     Thread {s['thread']}: Order #{s['order_id']}")
    
    print(f"")
    print(f"  [REJECTED] Insufficient stock: {len(results['rejected'])}")
    for r in results["rejected"]:
        print(f"     Thread {r['thread']}: {r['status_code']} -- {r['detail'][:80]}")
    
    if results["errors"]:
        print(f"")
        print(f"  [WARN] Errors: {len(results['errors'])}")
        for e in results["errors"]:
            print(f"     Thread {e['thread']}: {e['error'][:80]}")
    
    # === VERIFY INVENTORY ===
    print("")
    print("=" * 60)
    print("  INVENTORY VERIFICATION")
    print("=" * 60)
    
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute("""
        SELECT SUM(quantity) FROM inventory_batches 
        WHERE product_id = %s
    """, (product_id,))
    remaining_stock = cur.fetchone()[0] or 0
    
    total_units_sold = len(results["success"]) * UNITS_PER_ORDER
    expected_remaining = STOCK_TO_SET - total_units_sold
    
    print(f"  Starting stock:     {STOCK_TO_SET}")
    print(f"  Units sold:         {total_units_sold} ({len(results['success'])} orders x {UNITS_PER_ORDER})")
    print(f"  Expected remaining: {expected_remaining}")
    print(f"  Actual remaining:   {remaining_stock}")
    
    # Check for negative inventory
    cur.execute("""
        SELECT id, quantity FROM inventory_batches 
        WHERE product_id = %s AND quantity < 0
    """, (product_id,))
    negative_batches = cur.fetchall()
    
    cur.close()
    conn.close()
    
    print("")
    print("=" * 60)
    print("  VERDICT")
    print("=" * 60)
    
    passed = True
    
    # Test 1: No overselling
    if total_units_sold > STOCK_TO_SET:
        print(f"  [FAIL] OVERSOLD! Sold {total_units_sold} units from {STOCK_TO_SET} stock!")
        passed = False
    else:
        print(f"  [PASS] No overselling (sold {total_units_sold} <= {STOCK_TO_SET})")
    
    # Test 2: No negative inventory
    if negative_batches:
        print(f"  [FAIL] Negative inventory detected! Batches: {negative_batches}")
        passed = False
    else:
        print(f"  [PASS] No negative inventory")
    
    # Test 3: Math adds up
    if remaining_stock != expected_remaining:
        print(f"  [FAIL] Inventory math mismatch! Expected {expected_remaining}, got {remaining_stock}")
        passed = False
    else:
        print(f"  [PASS] Inventory math is correct ({remaining_stock} remaining)")
    
    # Test 4: Correct number of orders succeeded
    max_possible_orders = STOCK_TO_SET // UNITS_PER_ORDER
    if len(results["success"]) > max_possible_orders:
        print(f"  [FAIL] Too many orders! {len(results['success'])} > max possible {max_possible_orders}")
        passed = False
    else:
        print(f"  [PASS] Order count is valid ({len(results['success'])} <= {max_possible_orders})")
    
    print("")
    print("=" * 60)
    if passed:
        print("  ALL TESTS PASSED -- Your FIFO locking is solid!")
    else:
        print("  RACE CONDITION DETECTED -- Needs fixing!")
    print("=" * 60)
    print("")

if __name__ == "__main__":
    run_test()
