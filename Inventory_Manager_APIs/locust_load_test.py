"""
Locust Load Test for Inventory Manager API
===========================================

Simulates 50+ concurrent POS users performing realistic store operations:
- Browsing products/inventory
- Creating sales orders (the heaviest write operation)
- Checking purchase orders
- Viewing reports/analytics
- Searching and filtering

Usage:
  1. Start your API server: uvicorn main:app --host 0.0.0.0 --port 8000
  2. Run Locust:
     locust -f locust_load_test.py --host http://localhost:8000
  3. Open http://localhost:8089 in your browser
  4. Set users (e.g. 50), spawn rate (e.g. 5/s), and start!

Or headless mode (no browser needed):
  locust -f locust_load_test.py --host http://localhost:8000 \
         --headless -u 50 -r 5 --run-time 2m
"""

import random
import time
from locust import HttpUser, task, between, events


# ============================================================================
# CONFIGURATION
# ============================================================================

# Test credentials (from create_test_user.py)
TEST_USERNAME = "test_owner"
TEST_PASSWORD = "test123"

# API base path
API = "/api/v1"


# ============================================================================
# POS EMPLOYEE USER — Main load profile
# ============================================================================

class POSEmployee(HttpUser):
    """
    Simulates a POS employee performing typical daily tasks:
    - Frequent: Browse products, check stock, make sales
    - Moderate: View orders, search products
    - Rare: View reports, check purchase orders
    """
    wait_time = between(0.5, 2)  # Simulate human think time between actions

    # Token cached per user instance
    token = None

    # Cached data for realistic operations
    product_ids = []
    product_prices = {}  # product_id -> selling_price
    location_ids = []
    supplier_ids = []
    order_ids = []

    def on_start(self):
        """Login and cache essential data on user spawn."""
        self._login()
        self._cache_products()
        self._cache_locations()

    def _login(self):
        """Authenticate and store JWT token."""
        with self.client.post(
            f"{API}/users/login",
            data={"username": TEST_USERNAME, "password": TEST_PASSWORD},
            catch_response=True,
            name="LOGIN",
        ) as resp:
            if resp.status_code == 200:
                self.token = resp.json()["access_token"]
                resp.success()
            else:
                resp.failure(f"Login failed: {resp.status_code} - {resp.text}")
                self.token = None

    @property
    def auth_headers(self):
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def _cache_products(self):
        """Fetch product catalog for realistic sales."""
        try:
            resp = self.client.get(
                f"{API}/products/",
                headers=self.auth_headers,
                name="(setup) GET products",
            )
            if resp.status_code == 200:
                products = resp.json()
                self.product_ids = [p["id"] for p in products]
                self.product_prices = {
                    p["id"]: float(p["selling_price"]) for p in products
                }
        except Exception:
            pass

    def _cache_locations(self):
        """Fetch locations for inventory checks."""
        try:
            resp = self.client.get(
                f"{API}/locations/",
                headers=self.auth_headers,
                name="(setup) GET locations",
            )
            if resp.status_code == 200:
                self.location_ids = [loc["id"] for loc in resp.json()]
        except Exception:
            pass

    # ====================================================================
    # HIGH FREQUENCY TASKS (Browsing — every POS user does this constantly)
    # ====================================================================

    @task(10)
    def browse_products(self):
        """GET all products — the most common read operation."""
        self.client.get(
            f"{API}/products/",
            headers=self.auth_headers,
            name="GET /products",
        )

    @task(6)
    def get_single_product(self):
        """GET a specific product by ID."""
        if not self.product_ids:
            return
        pid = random.choice(self.product_ids)
        self.client.get(
            f"{API}/products/{pid}",
            headers=self.auth_headers,
            name="GET /products/[id]",
        )

    @task(5)
    def browse_locations(self):
        """GET all locations."""
        self.client.get(
            f"{API}/locations/",
            headers=self.auth_headers,
            name="GET /locations",
        )

    @task(4)
    def browse_suppliers(self):
        """GET all suppliers."""
        self.client.get(
            f"{API}/suppliers/",
            headers=self.auth_headers,
            name="GET /suppliers",
        )

    @task(5)
    def check_inventory(self):
        """GET inventory batches for a product — checking stock before sale."""
        if not self.product_ids:
            return
        pid = random.choice(self.product_ids)
        self.client.get(
            f"{API}/inventory/product/{pid}",
            headers=self.auth_headers,
            name="GET /inventory/stock/[id]",
        )

    # ====================================================================
    # MEDIUM FREQUENCY TASKS (Sales — the core write operation)
    # ====================================================================

    @task(8)
    def create_sale(self):
        """
        POST a new sale — THE most critical operation for stress testing.
        This exercises FIFO deduction, batch updates, alert checks, and more.
        """
        if not self.product_ids or not self.product_prices:
            return

        # Build a cart with 1-4 random products
        num_items = random.randint(1, 4)
        cart_product_ids = random.sample(
            self.product_ids, min(num_items, len(self.product_ids))
        )

        items = []
        for pid in cart_product_ids:
            price = self.product_prices.get(pid, 100.0)
            items.append({
                "product_id": pid,
                "quantity": random.randint(1, 3),
                "unit_price": price,
            })

        payment_method = random.choice(["cash", "upi", "card"])
        payment_ref = None
        if payment_method == "upi":
            payment_ref = f"UPI-LOAD-{random.randint(100000, 999999)}"
        elif payment_method == "card":
            payment_ref = f"CARD-XXXX-{random.randint(1000, 9999)}"

        names = [
            "Rahul Kumar", "Priya Singh", "Amit Patel", "Sneha Reddy",
            "Vikram Joshi", "Neha Sharma", "Arjun Mehta", "Kavya Nair",
            "Rohan Das", "Anita Gupta", "Sanjay Verma", "Deepa Iyer",
        ]

        order_data = {
            "customer_name": random.choice(names),
            "customer_email": f"load.test.{random.randint(1000,9999)}@example.com",
            "customer_phone": f"+91{random.randint(7000000000, 9999999999)}",
            "sales_channel": "in-store",
            "items": items,
            "payment_method": payment_method,
            "payment_reference": payment_ref,
        }

        with self.client.post(
            f"{API}/sales/orders",
            json=order_data,
            headers=self.auth_headers,
            catch_response=True,
            name="POST /sales/orders",
        ) as resp:
            if resp.status_code == 200:
                order = resp.json()
                self.order_ids.append(order["id"])
                # Keep only last 50 order IDs to avoid memory bloat
                if len(self.order_ids) > 50:
                    self.order_ids = self.order_ids[-50:]
                resp.success()
            elif resp.status_code == 400:
                # Expected: "Not enough stock" — valid business logic failure
                resp.success()
            else:
                resp.failure(f"Sale failed: {resp.status_code}")

    # ====================================================================
    # MODERATE FREQUENCY TASKS (Order management, search)
    # ====================================================================

    @task(4)
    def list_sales_orders(self):
        """GET paginated sales list — used when checking order history."""
        page = random.randint(1, 5)
        self.client.get(
            f"{API}/sales/orders?page={page}&limit=20",
            headers=self.auth_headers,
            name="GET /sales/orders",
        )

    @task(3)
    def get_order_details(self):
        """GET a single order's details."""
        if not self.order_ids:
            return
        oid = random.choice(self.order_ids)
        self.client.get(
            f"{API}/sales/orders/{oid}",
            headers=self.auth_headers,
            name="GET /sales/orders/[id]",
        )

    @task(3)
    def search_sales(self):
        """Search sales by customer name."""
        names = ["Rahul", "Priya", "Walk-in", "Amit", "Sneha"]
        search = random.choice(names)
        self.client.get(
            f"{API}/sales/orders?search={search}&page=1&limit=20",
            headers=self.auth_headers,
            name="GET /sales/orders?search=",
        )

    @task(2)
    def search_products(self):
        """Search products by SKU or barcode."""
        if not self.product_ids:
            return
        pid = random.choice(self.product_ids)
        # Search by product SKU
        self.client.get(
            f"{API}/products/{pid}",
            headers=self.auth_headers,
            name="GET /products/[id] (search)",
        )

    # ====================================================================
    # LOW FREQUENCY TASKS (Management activities)
    # ====================================================================

    @task(2)
    def list_purchase_orders(self):
        """GET purchase order history."""
        self.client.get(
            f"{API}/purchases/",
            headers=self.auth_headers,
            name="GET /purchases",
        )

    @task(1)
    def list_supplier_links(self):
        """GET product-supplier catalog links."""
        self.client.get(
            f"{API}/suppliers/product-links",
            headers=self.auth_headers,
            name="GET /suppliers/product-links",
        )

    @task(1)
    def view_analytics_dashboard(self):
        """GET analytics sales summary — aggregation query."""
        self.client.get(
            f"{API}/analytics/sales_summary",
            headers=self.auth_headers,
            name="GET /analytics/dashboard",
        )

    @task(1)
    def view_inventory_locations(self):
        """GET inventory locations list."""
        self.client.get(
            f"{API}/inventory/locations",
            headers=self.auth_headers,
            name="GET /inventory/locations",
        )


# ============================================================================
# MANAGER USER — Heavier management tasks, fewer users
# ============================================================================

class StoreManager(HttpUser):
    """
    Simulates a store manager doing management tasks:
    - Reports generation
    - Purchase order management
    - Analytics
    - User management
    """
    wait_time = between(2, 5)  # Managers are slower, more analytical
    weight = 2  # 1 manager for every 5 POS employees (weight ratio)

    token = None
    product_ids = []

    def on_start(self):
        self._login()
        self._cache_products()

    def _login(self):
        with self.client.post(
            f"{API}/users/login",
            data={"username": TEST_USERNAME, "password": TEST_PASSWORD},
            catch_response=True,
            name="LOGIN (manager)",
        ) as resp:
            if resp.status_code == 200:
                self.token = resp.json()["access_token"]
                resp.success()
            else:
                resp.failure(f"Login failed: {resp.status_code}")

    @property
    def auth_headers(self):
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def _cache_products(self):
        try:
            resp = self.client.get(
                f"{API}/products/",
                headers=self.auth_headers,
                name="(setup) GET products",
            )
            if resp.status_code == 200:
                self.product_ids = [p["id"] for p in resp.json()]
        except Exception:
            pass

    @task(3)
    def view_analytics(self):
        """Sales summary analytics — aggregation."""
        self.client.get(
            f"{API}/analytics/sales_summary",
            headers=self.auth_headers,
            name="GET /analytics/dashboard (mgr)",
        )

    @task(2)
    def view_sales_report(self):
        """Paginated sales with sorting."""
        sort = random.choice(["date", "amount", "customer", "id"])
        order = random.choice(["asc", "desc"])
        self.client.get(
            f"{API}/sales/orders?page=1&limit=50&sort_by={sort}&sort_order={order}",
            headers=self.auth_headers,
            name="GET /sales/orders (report)",
        )

    @task(2)
    def view_purchase_orders(self):
        """Check PO status."""
        status = random.choice(["draft", "placed", "received", ""])
        url = f"{API}/purchases/"
        if status:
            url += f"?status={status}"
        self.client.get(
            url,
            headers=self.auth_headers,
            name="GET /purchases (filtered)",
        )

    @task(1)
    def view_all_products(self):
        """Full product catalog."""
        self.client.get(
            f"{API}/products/",
            headers=self.auth_headers,
            name="GET /products (mgr)",
        )

    @task(1)
    def check_stock_level(self):
        """Check stock for a single product."""
        if not self.product_ids:
            return
        pid = random.choice(self.product_ids)
        self.client.get(
            f"{API}/inventory/product/{pid}",
            headers=self.auth_headers,
            name="GET /inventory/stock/[id] (mgr)",
        )

    @task(1)
    def view_all_suppliers(self):
        """Supplier list."""
        self.client.get(
            f"{API}/suppliers/",
            headers=self.auth_headers,
            name="GET /suppliers (mgr)",
        )

    @task(1)
    def view_users(self):
        """User management page."""
        self.client.get(
            f"{API}/users",
            headers=self.auth_headers,
            name="GET /users/list",
        )

    @task(1)
    def view_all_locations(self):
        """Location management."""
        self.client.get(
            f"{API}/locations/",
            headers=self.auth_headers,
            name="GET /locations (mgr)",
        )


# ============================================================================
# EVENT HOOKS — Custom reporting
# ============================================================================

@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    print("=" * 60)
    print("  LOCUST LOAD TEST — INVENTORY MANAGER")
    print("=" * 60)
    print(f"  Target: {environment.host}")
    print(f"  User classes: POSEmployee (weight=10), StoreManager (weight=2)")
    print()
    print("  Test profiles:")
    print("    POSEmployee — High freq reads + sales writes")
    print("    StoreManager — Reports, analytics, PO management")
    print("=" * 60)


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    print("\n" + "=" * 60)
    print("  LOAD TEST COMPLETE")
    print("=" * 60)

    stats = environment.runner.stats
    total = stats.total

    print(f"  Total requests:     {total.num_requests}")
    print(f"  Total failures:     {total.num_failures}")
    print(f"  Failure rate:       {total.fail_ratio * 100:.1f}%")
    print(f"  Avg response time:  {total.avg_response_time:.0f}ms")
    print(f"  Median:             {total.get_response_time_percentile(0.50):.0f}ms")
    print(f"  95th percentile:    {total.get_response_time_percentile(0.95):.0f}ms")
    print(f"  99th percentile:    {total.get_response_time_percentile(0.99):.0f}ms")
    print(f"  Requests/sec:       {total.total_rps:.1f}")
    print("=" * 60)
