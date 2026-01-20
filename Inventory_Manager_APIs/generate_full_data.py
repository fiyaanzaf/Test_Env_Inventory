import psycopg2
import random
import uuid
import os
from faker import Faker
from datetime import datetime, timedelta

# --- 1. CONFIGURATION ---
DB_CONFIG = {
    "dbname": "postgres",
    "user": "postgres",
    "password": "Merabadahai@202122", 
    "host": "localhost",
    "port": "5432"
}

fake = Faker()

def get_db_connection():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        print(f"[ERROR] Connection Failed: {e}")
        exit()

# --- HELPER FUNCTIONS ---

def get_or_create_location(cur, name, ltype, location_type):
    cur.execute("SELECT id FROM locations WHERE name = %s", (name,))
    res = cur.fetchone()
    if res:
        return res[0]
    
    print(f"   [+] Creating location: {name}")
    cur.execute("""
        INSERT INTO locations (name, type, location_type) 
        VALUES (%s, %s, %s) RETURNING id
    """, (name, ltype, location_type))
    return cur.fetchone()[0]

def get_or_create_supplier(cur, name, location, contact, phone, email):
    cur.execute("SELECT id FROM suppliers WHERE email = %s", (email,))
    res = cur.fetchone()
    if res:
        return res[0]
    
    cur.execute("""
        INSERT INTO suppliers (name, location, contact_person, phone_number, email) 
        VALUES (%s, %s, %s, %s, %s) 
        RETURNING id
    """, (name, location, contact, phone, email))
    return cur.fetchone()[0]

def get_or_create_product(cur, name, sku, price, supplier_id, category, uom):
    cur.execute("SELECT id FROM products WHERE sku = %s", (sku,))
    res = cur.fetchone()
    if res:
        return res[0]

    cur.execute("""
        INSERT INTO products (name, sku, price, supplier_id, category, unit_of_measure, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, NOW()) 
        RETURNING id
    """, (name, sku, price, supplier_id, category, uom))
    return cur.fetchone()[0]

def get_or_create_user(cur, username, email, phone):
    # 1. Check by Email
    cur.execute("SELECT id FROM users WHERE email = %s", (email,))
    res = cur.fetchone()
    if res: return res[0]
        
    # 2. Check by Username
    cur.execute("SELECT id FROM users WHERE username = %s", (username,))
    res = cur.fetchone()
    if res: return res[0]

    # 3. Check by Phone Number
    cur.execute("SELECT id FROM users WHERE phone_number = %s", (phone,))
    res = cur.fetchone()
    if res: return res[0]

    # 4. Insert if completely new
    cur.execute("""
        INSERT INTO users (username, email, password_hash, is_active, phone_number) 
        VALUES (%s, %s, 'hash_placeholder', TRUE, %s) 
        RETURNING id;
    """, (username, email, phone))
    return cur.fetchone()[0]

def ensure_inventory_exists(cur, product_id, location_id, cat, sell_price):
    cur.execute("""
        SELECT id FROM inventory_batches 
        WHERE product_id = %s AND location_id = %s AND quantity > 0
    """, (product_id, location_id))
    
    if cur.fetchone():
        return 

    print(f"   [+] Initializing Stock for Product ID {product_id}...")
    batch_code = f"BATCH-{str(uuid.uuid4())[:8].upper()}"
    days = random.randint(5, 15) if cat in ['Dairy', 'Bakery', 'Produce'] else random.randint(100, 300)
    expiry = datetime.now() + timedelta(days=days)
    cost_price = round(sell_price * random.uniform(0.6, 0.8), 2)
    
    cur.execute("""
        INSERT INTO inventory_batches (product_id, location_id, batch_code, quantity, expiry_date, received_at, cost_price)
        VALUES (%s, %s, %s, %s, %s, NOW(), %s);
    """, (product_id, location_id, batch_code, random.randint(200, 500), expiry, cost_price))

# --- MAIN EXECUTION ---

def generate_data():
    conn = get_db_connection()
    cur = conn.cursor()
    
    print(">>> Starting Data Generation (V8 - Windows Safe)...")

    # --- 1. LOCATIONS ---
    print("   [-] Checking Locations...")
    target_locations = {
        "Dairy Aisle": "store", "Bakery Aisle": "store", "Snacks Aisle": "store",
        "Produce Section": "store", "Beverage Aisle": "store", "Warehouse Bay A": "warehouse"
    }
    loc_map = {}
    for name, ltype in target_locations.items():
        loc_map[name] = get_or_create_location(cur, name, ltype, ltype)

    # --- 2. SUPPLIERS ---
    print("   [-] Checking Suppliers...")
    supplier_ids = []
    for _ in range(3): 
        sid = get_or_create_supplier(cur, fake.company() + " Foods", fake.city(), fake.name(), fake.phone_number(), fake.company_email())
        supplier_ids.append(sid)

    # --- 3. PRODUCTS ---
    print("   [-] Checking Products & Inventory...")
    product_defs = [
        ("milk", "Fresh Full Cream Milk", "DAIRY-001", 60.00, "Dairy", "Litre", "Dairy Aisle"),
        ("butter", "Salted Butter Block", "DAIRY-002", 240.00, "Dairy", "Block", "Dairy Aisle"),
        ("cheese", "Cheddar Cheese Slices", "DAIRY-003", 150.00, "Dairy", "Pack", "Dairy Aisle"),
        ("yogurt", "Greek Yogurt Cup", "DAIRY-004", 45.00, "Dairy", "Cup", "Dairy Aisle"),
        ("bread", "Whole Wheat Bread", "BAKE-001", 50.00, "Bakery", "Loaf", "Bakery Aisle"),
        ("jam", "Fruit Jam (Mixed)", "BAKE-002", 120.00, "Bakery", "Jar", "Bakery Aisle"),
        ("muffins", "Chocolate Muffins", "BAKE-003", 90.00, "Bakery", "Pack", "Bakery Aisle"),
        ("buns", "Burger Buns (4pcs)", "BAKE-004", 40.00, "Bakery", "Pack", "Bakery Aisle"),
        ("rice", "Basmati Rice (5kg)", "PANTRY-001", 650.00, "Pantry", "Bag", "Warehouse Bay A"),
        ("oil", "Sunflower Oil (1L)", "PANTRY-002", 180.00, "Pantry", "Bottle", "Warehouse Bay A"),
        ("pasta", "Italian Penne Pasta", "PANTRY-003", 120.00, "Pantry", "Packet", "Warehouse Bay A"),
        ("sauce", "Tomato Basil Sauce", "PANTRY-004", 160.00, "Pantry", "Jar", "Warehouse Bay A"),
        ("chips", "Classic Salted Chips", "SNACK-001", 20.00, "Snacks", "Bag", "Snacks Aisle"),
        ("nachos", "Spicy Nachos", "SNACK-002", 85.00, "Snacks", "Bag", "Snacks Aisle"),
        ("choc", "Dark Chocolate Bar", "SNACK-003", 150.00, "Snacks", "Bar", "Snacks Aisle"),
        ("popcorn", "Salted Popcorn", "SNACK-004", 60.00, "Snacks", "Bag", "Snacks Aisle"),
        ("coffee", "Instant Coffee Jar", "BEV-001", 450.00, "Beverages", "Jar", "Beverage Aisle"),
        ("sugar", "White Sugar (1kg)", "BEV-002", 55.00, "Pantry", "Packet", "Beverage Aisle"),
        ("apple", "Green Apples (1kg)", "PROD-001", 220.00, "Produce", "Kg", "Produce Section"),
        ("banana", "Fresh Bananas (1kg)", "PROD-002", 60.00, "Produce", "Kg", "Produce Section"),
    ]

    p_map = {} 
    for ref, name, sku, price, cat, uom, loc_name in product_defs:
        supplier_id = random.choice(supplier_ids)
        real_id = get_or_create_product(cur, name, sku, price, supplier_id, cat, uom)
        p_map[ref] = {"id": real_id, "price": price, "cat": cat}
        ensure_inventory_exists(cur, real_id, loc_map[loc_name], cat, price)

    # --- 4. USERS ---
    print("   [-] Checking Users...")
    
    cur.execute("SELECT id FROM roles WHERE name = 'customer'")
    role_res = cur.fetchone()
    if not role_res:
        cur.execute("INSERT INTO roles (name, description) VALUES ('customer', 'Regular Customer') RETURNING id")
        customer_role_id = cur.fetchone()[0]
    else:
        customer_role_id = role_res[0]

    users_list = []
    for _ in range(10): 
        email = fake.unique.email()
        username = email.split('@')[0]
        phone_number = fake.unique.phone_number()[:50]

        user_id = get_or_create_user(cur, username, email, phone_number)
        
        cur.execute("SELECT 1 FROM user_roles WHERE user_id=%s AND role_id=%s", (user_id, customer_role_id))
        if not cur.fetchone():
            cur.execute("INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s)", (user_id, customer_role_id))

        users_list.append({"id": user_id, "name": fake.name(), "email": email, "phone": phone_number})
    
    # --- 5. SALES ORDERS ---
    print("   [-] Generating 500 Historical Sales Orders...")
    
    available_keys = list(p_map.keys())
    
    for i in range(500):
        created_at = fake.date_time_between(start_date='-60d', end_date='now')
        
        if users_list and random.random() < 0.7: 
            u = random.choice(users_list)
            c_name, c_email, c_phone, uid = u['name'], u['email'], u['phone'], u['id']
        else:
            c_name, c_email, c_phone, uid = fake.name(), fake.email(), fake.phone_number()[:20], None

        dice = random.random()
        cart_keys = []
        
        if dice < 0.20:
            cart_keys = [k for k in ['milk', 'bread', 'butter', 'jam', 'coffee'] if k in available_keys]
            if cart_keys: cart_keys = random.sample(cart_keys, k=random.randint(1, len(cart_keys)))
        elif dice < 0.40: 
            cart_keys = [k for k in ['pasta', 'sauce', 'cheese', 'rice', 'oil'] if k in available_keys]
            if cart_keys: cart_keys = random.sample(cart_keys, k=random.randint(1, len(cart_keys)))
        elif dice < 0.60: 
            cart_keys = [k for k in ['chips', 'nachos', 'popcorn', 'choc', 'beverage'] if k in available_keys]
            if cart_keys: cart_keys = random.sample(cart_keys, k=random.randint(1, len(cart_keys)))
        else: 
            cart_keys = random.sample(available_keys, k=random.randint(1, 6))

        if not cart_keys: continue 

        cur.execute("""
            INSERT INTO sales_orders 
            (customer_name, customer_email, customer_phone, total_amount, sales_channel, status, fulfillment_method, user_id, order_timestamp)
            VALUES (%s, %s, %s, 0, 'in-store', 'completed', 'POS', %s, %s) 
            RETURNING id;
        """, (c_name, c_email, c_phone, uid, created_at))
        oid = cur.fetchone()[0]

        total = 0
        for key in cart_keys:
            pid = p_map[key]['id']
            price = p_map[key]['price']
            qty = random.randint(1, 3)
            
            cur.execute("""
                INSERT INTO sales_order_items (order_id, product_id, quantity, price_at_sale) 
                VALUES (%s, %s, %s, %s)
            """, (oid, pid, qty, price))
            
            total += (price * qty)

        cur.execute("UPDATE sales_orders SET total_amount = %s WHERE id = %s", (total, oid))

    conn.commit()
    cur.close()
    conn.close()
    print(">>> SUCCESS! Users and Sales data generated.")

if __name__ == "__main__":
    generate_data()