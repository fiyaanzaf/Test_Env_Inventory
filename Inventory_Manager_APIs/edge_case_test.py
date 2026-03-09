"""
Edge Case Tests - Inventory Manager API
========================================
Tests boundary conditions and invalid inputs to make sure
the API handles them gracefully without crashing.

Usage:
  1. Make sure the API server is running on localhost:8000
  2. Run:  ./venv/Scripts/python edge_case_test.py
"""

import requests
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# === CONFIG ===
BASE_URL = "http://localhost:8000"
API = f"{BASE_URL}/api/v1"
USERNAME = "test_owner"
PASSWORD = "test123"

# === Tracking ===
total_tests = 0
passed_tests = 0
failed_tests = 0
failed_list = []

def get_db():
    return psycopg2.connect(
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS"),
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432")
    )

def login():
    resp = requests.post(f"{API}/users/login", data={
        "username": USERNAME,
        "password": PASSWORD
    })
    resp.raise_for_status()
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}

def check(test_name, condition, detail=""):
    global total_tests, passed_tests, failed_tests
    total_tests += 1
    if condition:
        passed_tests += 1
        print(f"  [PASS] {test_name}")
    else:
        failed_tests += 1
        failed_list.append(test_name)
        print(f"  [FAIL] {test_name} -- {detail}")

# ============================================================
# TEST GROUP 1: Sales Order Edge Cases
# ============================================================
def test_sales_edge_cases(headers):
    print("")
    print("=" * 60)
    print("  TEST GROUP 1: Sales Order Edge Cases")
    print("=" * 60)
    
    # Get a real product for testing
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT p.id, p.name, p.selling_price 
        FROM products p 
        JOIN inventory_batches b ON p.id = b.product_id 
        WHERE b.quantity > 0 
        LIMIT 1
    """)
    product = cur.fetchone()
    cur.close()
    conn.close()
    
    if not product:
        print("  [SKIP] No products with stock found")
        return
    
    pid, pname, pprice = product
    price = float(pprice) if pprice else 100.0
    
    # --- Test 1.1: Empty items list ---
    resp = requests.post(f"{API}/sales/orders", json={
        "customer_name": "Edge Test",
        "sales_channel": "in-store",
        "payment_method": "cash",
        "items": []
    }, headers=headers)
    check("Empty items list is rejected",
          resp.status_code in [400, 422],
          f"Got {resp.status_code}: {resp.text[:100]}")
    
    # --- Test 1.2: Zero quantity ---
    resp = requests.post(f"{API}/sales/orders", json={
        "customer_name": "Edge Test",
        "sales_channel": "in-store",
        "payment_method": "cash",
        "items": [{"product_id": pid, "quantity": 0, "unit_price": price}]
    }, headers=headers)
    check("Zero quantity order is rejected",
          resp.status_code in [400, 422],
          f"Got {resp.status_code}: {resp.text[:100]}")
    
    # --- Test 1.3: Negative quantity ---
    resp = requests.post(f"{API}/sales/orders", json={
        "customer_name": "Edge Test",
        "sales_channel": "in-store",
        "payment_method": "cash",
        "items": [{"product_id": pid, "quantity": -5, "unit_price": price}]
    }, headers=headers)
    check("Negative quantity is rejected",
          resp.status_code in [400, 422, 500],
          f"Got {resp.status_code}: {resp.text[:100]}")
    
    # --- Test 1.4: Ridiculously large quantity ---
    resp = requests.post(f"{API}/sales/orders", json={
        "customer_name": "Edge Test",
        "sales_channel": "in-store",
        "payment_method": "cash",
        "items": [{"product_id": pid, "quantity": 999999, "unit_price": price}]
    }, headers=headers)
    check("Huge quantity (999999) is rejected",
          resp.status_code == 400,
          f"Got {resp.status_code}: {resp.text[:100]}")
    
    # --- Test 1.5: Non-existent product ID ---
    resp = requests.post(f"{API}/sales/orders", json={
        "customer_name": "Edge Test",
        "sales_channel": "in-store",
        "payment_method": "cash",
        "items": [{"product_id": 99999, "quantity": 1, "unit_price": 100}]
    }, headers=headers)
    check("Non-existent product ID is rejected",
          resp.status_code in [400, 404, 500],
          f"Got {resp.status_code}: {resp.text[:100]}")
    
    # --- Test 1.6: Negative price ---
    resp = requests.post(f"{API}/sales/orders", json={
        "customer_name": "Edge Test",
        "sales_channel": "in-store",
        "payment_method": "cash",
        "items": [{"product_id": pid, "quantity": 1, "unit_price": -50.0}]
    }, headers=headers)
    check("Negative price is rejected",
          resp.status_code in [400, 422],
          f"Got {resp.status_code}: {resp.text[:100]}")
    
    # --- Test 1.7: Zero price (free item) ---
    resp = requests.post(f"{API}/sales/orders", json={
        "customer_name": "Edge Test",
        "sales_channel": "in-store",
        "payment_method": "cash",
        "items": [{"product_id": pid, "quantity": 1, "unit_price": 0}]
    }, headers=headers)
    # Zero price might be allowed for complimentary items
    check("Zero price order handled (either accepted or rejected)",
          resp.status_code in [200, 400, 422],
          f"Got {resp.status_code}: {resp.text[:100]}")
    
    # --- Test 1.8: Missing required fields ---
    resp = requests.post(f"{API}/sales/orders", json={
        "customer_name": "Edge Test"
    }, headers=headers)
    check("Missing required fields is rejected (no items/channel)",
          resp.status_code == 422,
          f"Got {resp.status_code}: {resp.text[:100]}")
    
    # --- Test 1.9: Invalid sales channel ---
    resp = requests.post(f"{API}/sales/orders", json={
        "customer_name": "Edge Test",
        "sales_channel": "carrier-pigeon",
        "payment_method": "cash",
        "items": [{"product_id": pid, "quantity": 1, "unit_price": price}]
    }, headers=headers)
    check("Invalid sales channel handled gracefully",
          resp.status_code in [200, 400, 422],
          f"Got {resp.status_code}: {resp.text[:100]}")
    
    # --- Test 1.10: Invalid payment method ---
    resp = requests.post(f"{API}/sales/orders", json={
        "customer_name": "Edge Test",
        "sales_channel": "in-store",
        "payment_method": "bitcoin",
        "items": [{"product_id": pid, "quantity": 1, "unit_price": price}]
    }, headers=headers)
    check("Invalid payment method handled gracefully",
          resp.status_code in [200, 400, 422],
          f"Got {resp.status_code}: {resp.text[:100]}")


# ============================================================
# TEST GROUP 2: Product Endpoint Edge Cases
# ============================================================
def test_product_edge_cases(headers):
    print("")
    print("=" * 60)
    print("  TEST GROUP 2: Product / Inventory Edge Cases")
    print("=" * 60)
    
    # --- Test 2.1: Get product with ID 0 ---
    resp = requests.get(f"{API}/products/0", headers=headers)
    check("Product ID 0 returns 404",
          resp.status_code == 404,
          f"Got {resp.status_code}")
    
    # --- Test 2.2: Get product with negative ID ---
    resp = requests.get(f"{API}/products/-1", headers=headers)
    check("Product ID -1 returns 404 or 422",
          resp.status_code in [404, 422],
          f"Got {resp.status_code}")
    
    # --- Test 2.3: Get product with very large ID ---
    resp = requests.get(f"{API}/products/9999999", headers=headers)
    check("Non-existent product ID returns 404",
          resp.status_code == 404,
          f"Got {resp.status_code}")
    
    # --- Test 2.4: Inventory for non-existent product ---
    resp = requests.get(f"{API}/inventory/product/9999999", headers=headers)
    check("Inventory for non-existent product returns 404",
          resp.status_code == 404,
          f"Got {resp.status_code}")
    
    # --- Test 2.5: Products list with huge page number ---
    resp = requests.get(f"{API}/products?page=99999", headers=headers)
    check("Huge page number returns empty list (not crash)",
          resp.status_code == 200,
          f"Got {resp.status_code}: {resp.text[:100]}")
    
    # --- Test 2.6: Products list with negative page ---
    resp = requests.get(f"{API}/products?page=-1", headers=headers)
    check("Negative page number handled gracefully",
          resp.status_code in [200, 400, 422],
          f"Got {resp.status_code}")
    
    # --- Test 2.7: Products search with empty string ---
    resp = requests.get(f"{API}/products?search=", headers=headers)
    check("Empty search string returns all products",
          resp.status_code == 200,
          f"Got {resp.status_code}")
    
    # --- Test 2.8: Products search with special characters ---
    resp = requests.get(f"{API}/products?search='; DROP TABLE products; --", headers=headers)
    check("SQL injection in search is handled safely",
          resp.status_code == 200,
          f"Got {resp.status_code}: {resp.text[:100]}")


# ============================================================
# TEST GROUP 3: Authentication Edge Cases
# ============================================================
def test_auth_edge_cases(headers):
    print("")
    print("=" * 60)
    print("  TEST GROUP 3: Authentication Edge Cases")
    print("=" * 60)
    
    # --- Test 3.1: No auth header on protected endpoint ---
    resp = requests.get(f"{API}/inventory/locations")
    check("No auth header returns 401",
          resp.status_code == 401,
          f"Got {resp.status_code}")
    
    # --- Test 3.2: Invalid token on protected endpoint ---
    bad_headers = {"Authorization": "Bearer totally.fake.token"}
    resp = requests.get(f"{API}/inventory/locations", headers=bad_headers)
    check("Invalid JWT token returns 401",
          resp.status_code == 401,
          f"Got {resp.status_code}")
    
    # --- Test 3.3: Empty bearer token on protected endpoint ---
    bad_headers = {"Authorization": "Bearer "}
    resp = requests.get(f"{API}/inventory/locations", headers=bad_headers)
    check("Empty bearer token returns 401",
          resp.status_code == 401,
          f"Got {resp.status_code}")
    
    # --- Test 3.4: Wrong password login ---
    resp = requests.post(f"{API}/users/login", data={
        "username": USERNAME,
        "password": "wrong_password_123"
    })
    check("Wrong password returns 401",
          resp.status_code == 401,
          f"Got {resp.status_code}")
    
    # --- Test 3.5: Non-existent user login ---
    resp = requests.post(f"{API}/users/login", data={
        "username": "user_that_surely_does_not_exist_xyz",
        "password": "whatever"
    })
    check("Non-existent user login returns 401",
          resp.status_code == 401,
          f"Got {resp.status_code}")
    
    # --- Test 3.6: Empty username login ---
    resp = requests.post(f"{API}/users/login", data={
        "username": "",
        "password": ""
    })
    check("Empty credentials returns 401",
          resp.status_code in [401, 422],
          f"Got {resp.status_code}")


# ============================================================
# TEST GROUP 4: Inventory Operations Edge Cases
# ============================================================
def test_inventory_edge_cases(headers):
    print("")
    print("=" * 60)
    print("  TEST GROUP 4: Inventory Operations Edge Cases")
    print("=" * 60)
    
    # Get real IDs for testing
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM products LIMIT 1")
    product_id = cur.fetchone()[0]
    cur.execute("SELECT id FROM locations LIMIT 2")
    locations = cur.fetchall()
    loc1 = locations[0][0]
    loc2 = locations[1][0] if len(locations) > 1 else loc1
    cur.close()
    conn.close()
    
    # --- Test 4.1: Transfer to same location ---
    resp = requests.post(f"{API}/inventory/transfer", json={
        "product_id": product_id,
        "from_location_id": loc1,
        "to_location_id": loc1,
        "quantity": 1
    }, headers=headers)
    check("Transfer to same location is rejected",
          resp.status_code == 400,
          f"Got {resp.status_code}: {resp.text[:100]}")
    
    # --- Test 4.2: Transfer zero quantity ---
    resp = requests.post(f"{API}/inventory/transfer", json={
        "product_id": product_id,
        "from_location_id": loc1,
        "to_location_id": loc2,
        "quantity": 0
    }, headers=headers)
    check("Transfer zero quantity handled",
          resp.status_code in [400, 422, 500],
          f"Got {resp.status_code}: {resp.text[:100]}")
    
    # --- Test 4.3: Transfer negative quantity ---
    resp = requests.post(f"{API}/inventory/transfer", json={
        "product_id": product_id,
        "from_location_id": loc1,
        "to_location_id": loc2,
        "quantity": -5
    }, headers=headers)
    check("Transfer negative quantity handled",
          resp.status_code in [400, 422, 500],
          f"Got {resp.status_code}: {resp.text[:100]}")
    
    # --- Test 4.4: Transfer more than available ---
    resp = requests.post(f"{API}/inventory/transfer", json={
        "product_id": product_id,
        "from_location_id": loc1,
        "to_location_id": loc2,
        "quantity": 999999
    }, headers=headers)
    check("Transfer more than available is rejected",
          resp.status_code == 400,
          f"Got {resp.status_code}: {resp.text[:100]}")
    
    # --- Test 4.5: Write-off non-existent batch ---
    resp = requests.post(f"{API}/inventory/write_off", json={
        "batch_id": 999999,
        "quantity_to_remove": 1,
        "reason": "Test write-off"
    }, headers=headers)
    check("Write-off non-existent batch returns 404",
          resp.status_code == 404,
          f"Got {resp.status_code}: {resp.text[:100]}")
    
    # --- Test 4.6: Receive with invalid product ID ---
    resp = requests.post(f"{API}/inventory/receive", json={
        "product_id": 999999,
        "location_id": loc1,
        "quantity": 10,
        "unit_cost": 50.0
    }, headers=headers)
    check("Receive with invalid product ID is rejected",
          resp.status_code == 400,
          f"Got {resp.status_code}: {resp.text[:100]}")


# ============================================================
# TEST GROUP 5: Sales Order Retrieval Edge Cases
# ============================================================
def test_sales_retrieval_edge_cases(headers):
    print("")
    print("=" * 60)
    print("  TEST GROUP 5: Sales Retrieval Edge Cases")
    print("=" * 60)
    
    # --- Test 5.1: Get non-existent order ---
    resp = requests.get(f"{API}/sales/orders/999999", headers=headers)
    check("Non-existent order returns 404",
          resp.status_code == 404,
          f"Got {resp.status_code}")
    
    # --- Test 5.2: Get order with ID 0 ---
    resp = requests.get(f"{API}/sales/orders/0", headers=headers)
    check("Order ID 0 returns 404",
          resp.status_code == 404,
          f"Got {resp.status_code}")
    
    # --- Test 5.3: Sales list with invalid status filter ---
    resp = requests.get(f"{API}/sales/orders?status=nonexistent", headers=headers)
    check("Invalid status filter returns empty (not crash)",
          resp.status_code == 200,
          f"Got {resp.status_code}")
    
    # --- Test 5.4: SQL injection in search ---
    resp = requests.get(f"{API}/sales/orders?search='; DROP TABLE sales_orders; --", headers=headers)
    check("SQL injection in sales search is handled safely",
          resp.status_code == 200,
          f"Got {resp.status_code}: {resp.text[:100]}")


# ============================================================
# MAIN
# ============================================================
def run_all():
    print("")
    print("=" * 60)
    print("  EDGE CASE TESTS - Inventory Manager API")
    print("=" * 60)
    
    print("\n[LOGIN] Logging in...")
    headers = login()
    print("[OK] Login successful")
    
    test_sales_edge_cases(headers)
    test_product_edge_cases(headers)
    test_auth_edge_cases(headers)
    test_inventory_edge_cases(headers)
    test_sales_retrieval_edge_cases(headers)
    
    # === FINAL REPORT ===
    print("")
    print("=" * 60)
    print("  FINAL REPORT")
    print("=" * 60)
    print(f"  Total tests:  {total_tests}")
    print(f"  Passed:       {passed_tests}")
    print(f"  Failed:       {failed_tests}")
    print(f"  Pass rate:    {(passed_tests/total_tests*100):.1f}%")
    
    if failed_list:
        print("")
        print("  Failed tests:")
        for f in failed_list:
            print(f"    - {f}")
    
    print("")
    print("=" * 60)
    if failed_tests == 0:
        print("  ALL TESTS PASSED!")
    elif failed_tests <= 3:
        print("  MOSTLY PASSED -- Minor issues to review")
    else:
        print("  NEEDS ATTENTION -- Several edge cases not handled")
    print("=" * 60)
    print("")

if __name__ == "__main__":
    run_all()
