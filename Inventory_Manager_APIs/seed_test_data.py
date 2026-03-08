"""
Seed Script: Populate the Inventory Manager database with comprehensive test data.

Simulates a complete store workflow:
1. Create suppliers (15)
2. Create locations (10 — 7 store + 3 warehouse)
3. Create products (500 across 15 categories, all fields filled)
4. Link products to preferred suppliers in product_suppliers
5. Create purchase orders (POs) to acquire products from suppliers
6. Create supplier invoices for each PO
7. Create GRN records (goods receipt notes) with scanned/QA-approved items
8. Create inventory batches (from completed GRNs)
9. Create sales orders (300) with line items

Safe to re-run: uses ON CONFLICT / existence checks.
"""

import psycopg2
import random
import uuid
import os
from faker import Faker
from datetime import datetime, date, timedelta
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    "dbname": os.getenv("DB_NAME", "postgres"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASS", "Merabadahai@202122"),
    "host": os.getenv("DB_HOST", "localhost"),
    "port": os.getenv("DB_PORT", "5432"),
}

fake = Faker()
Faker.seed(42)
random.seed(42)


def get_db_connection():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        print(f"[ERROR] Connection Failed: {e}")
        exit(1)


# ============================================================================
# PRODUCT CATALOG DEFINITIONS (500 items across 15 categories)
# ============================================================================

CATEGORIES = {
    "Electronics": {
        "prefix": "ELEC",
        "uom": "Piece",
        "price_range": (500, 25000),
        "hsn": "8471",
        "tax_rate": 18.0,
        "items": [
            "Wireless Earbuds", "USB-C Cable 1m", "USB-C Cable 2m", "Phone Stand",
            "Screen Protector", "Laptop Sleeve 13in", "Laptop Sleeve 15in",
            "Mouse Pad XL", "Webcam HD 720p", "Webcam FHD 1080p",
            "Bluetooth Speaker Mini", "Bluetooth Speaker Pro", "Power Bank 10000mAh",
            "Power Bank 20000mAh", "HDMI Cable 1.5m", "HDMI Cable 3m",
            "Wireless Mouse", "Wired Mouse", "USB Hub 4-Port", "USB Hub 7-Port",
            "Keyboard Wireless", "Keyboard Mechanical", "Monitor Stand",
            "Cable Organizer Set", "Surge Protector 4-Way", "Surge Protector 6-Way",
            "Smart Plug WiFi", "LED Desk Lamp", "Ring Light 10in",
            "Portable SSD 256GB", "Portable SSD 512GB", "Flash Drive 32GB",
            "Flash Drive 64GB", "Flash Drive 128GB", "Ethernet Cable Cat6 2m",
        ],
    },
    "Clothing": {
        "prefix": "CLTH",
        "uom": "Piece",
        "price_range": (200, 5000),
        "hsn": "6109",
        "tax_rate": 5.0,
        "items": [
            "Cotton T-Shirt White S", "Cotton T-Shirt White M", "Cotton T-Shirt White L",
            "Cotton T-Shirt Black S", "Cotton T-Shirt Black M", "Cotton T-Shirt Black L",
            "Polo Shirt Navy M", "Polo Shirt Navy L", "Formal Shirt Blue M",
            "Formal Shirt Blue L", "Casual Shirt Check M", "Casual Shirt Check L",
            "Jeans Slim Fit 30", "Jeans Slim Fit 32", "Jeans Slim Fit 34",
            "Jeans Regular Fit 30", "Jeans Regular Fit 32", "Jeans Regular Fit 34",
            "Chinos Beige 32", "Chinos Beige 34", "Hoodie Grey M",
            "Hoodie Grey L", "Jacket Windbreaker M", "Jacket Windbreaker L",
            "Shorts Cotton M", "Shorts Cotton L", "Socks Cotton Pack 3",
            "Socks Cotton Pack 6", "Belt Leather Brown", "Belt Leather Black",
            "Cap Baseball Navy", "Cap Baseball Black", "Scarf Woolen",
            "Track Pants M", "Track Pants L",
        ],
    },
    "Grocery": {
        "prefix": "GROC",
        "uom": "Pack",
        "price_range": (20, 800),
        "hsn": "1006",
        "tax_rate": 5.0,
        "items": [
            "Atta Whole Wheat 5kg", "Atta Whole Wheat 10kg", "Rice Basmati 1kg",
            "Rice Basmati 5kg", "Toor Dal 1kg", "Moong Dal 1kg",
            "Chana Dal 1kg", "Masoor Dal 1kg", "Sugar White 1kg",
            "Sugar White 5kg", "Salt Iodized 1kg", "Turmeric Powder 200g",
            "Red Chili Powder 200g", "Coriander Powder 200g", "Garam Masala 100g",
            "Cumin Seeds 200g", "Mustard Seeds 200g", "Black Pepper 100g",
            "Tea Leaves 500g", "Tea Leaves 1kg", "Coffee Instant 200g",
            "Cooking Oil Sunflower 1L", "Cooking Oil Sunflower 5L",
            "Cooking Oil Mustard 1L", "Cooking Oil Mustard 5L",
            "Ghee Pure 500g", "Ghee Pure 1kg", "Honey Pure 500g",
            "Vinegar White 500ml", "Soy Sauce 200ml", "Tomato Ketchup 500g",
            "Mayonnaise 250g", "Peanut Butter 500g", "Oats Rolled 500g",
            "Cornflakes 500g",
        ],
    },
    "Dairy": {
        "prefix": "DAIR",
        "uom": "Pack",
        "price_range": (30, 500),
        "hsn": "0401",
        "tax_rate": 5.0,
        "items": [
            "Milk Full Cream 500ml", "Milk Full Cream 1L", "Milk Toned 500ml",
            "Milk Toned 1L", "Curd Fresh 500g", "Curd Fresh 1kg",
            "Paneer Fresh 200g", "Paneer Fresh 500g", "Butter Salted 100g",
            "Butter Salted 500g", "Cheese Slice 200g", "Cheese Block 500g",
            "Yogurt Mango 200g", "Yogurt Strawberry 200g", "Yogurt Plain 500g",
            "Cream Fresh 200ml", "Condensed Milk 400g", "Buttermilk 500ml",
            "Lassi Mango 200ml", "Lassi Sweet 200ml", "Whipped Cream 250ml",
            "Flavored Milk Chocolate 200ml", "Flavored Milk Strawberry 200ml",
            "Shrikhand Kesar 250g", "Khoa Fresh 250g", "Ricotta Cheese 250g",
            "Mozzarella Cheese 200g", "Processed Cheese Spread 200g",
            "Milkshake Mix Vanilla 200g", "Milkshake Mix Chocolate 200g",
        ],
    },
    "Bakery": {
        "prefix": "BAKE",
        "uom": "Pack",
        "price_range": (25, 400),
        "hsn": "1905",
        "tax_rate": 5.0,
        "items": [
            "White Bread Sliced", "Brown Bread Sliced", "Multigrain Bread",
            "Burger Buns 4pcs", "Hotdog Buns 4pcs", "Pav Buns 8pcs",
            "Croissant Plain 2pcs", "Croissant Chocolate 2pcs", "Muffin Chocolate 4pcs",
            "Muffin Vanilla 4pcs", "Cookie Choco Chip 200g", "Cookie Butter 200g",
            "Cake Slice Chocolate", "Cake Slice Vanilla", "Rusk Tea 300g",
            "Rusk Classic 300g", "Pizza Base 2pcs", "Garlic Bread 200g",
            "Dinner Roll 6pcs", "Baguette French", "Cake Mix Chocolate 500g",
            "Cake Mix Vanilla 500g", "Pastry Puff 4pcs", "Donut Glazed 4pcs",
            "Brownie Mix 500g",
        ],
    },
    "Beverages": {
        "prefix": "BEVR",
        "uom": "Bottle",
        "price_range": (15, 600),
        "hsn": "2202",
        "tax_rate": 12.0,
        "items": [
            "Water Mineral 500ml", "Water Mineral 1L", "Cola Classic 300ml",
            "Cola Classic 750ml", "Cola Classic 2L", "Lemon Soda 300ml",
            "Orange Juice 1L", "Apple Juice 1L", "Mango Juice 1L",
            "Mixed Fruit Juice 1L", "Energy Drink 250ml", "Energy Drink 500ml",
            "Green Tea Bags 25pc", "Black Tea Bags 25pc", "Herbal Tea Bags 25pc",
            "Instant Coffee Sachet 10pc", "Cold Coffee Can 250ml",
            "Coconut Water 200ml", "Coconut Water 1L", "Lemonade Fresh 500ml",
            "Protein Shake Chocolate 200ml", "Protein Shake Vanilla 200ml",
            "Tonic Water 200ml", "Ginger Ale 300ml", "Sparkling Water 750ml",
        ],
    },
    "Snacks": {
        "prefix": "SNCK",
        "uom": "Pack",
        "price_range": (10, 300),
        "hsn": "1905",
        "tax_rate": 12.0,
        "items": [
            "Chips Classic Salted 100g", "Chips Masala 100g", "Chips BBQ 100g",
            "Chips Cream Onion 100g", "Namkeen Mix 200g", "Bhujia 400g",
            "Peanuts Roasted 200g", "Peanuts Masala 200g", "Cashew Roasted 200g",
            "Almonds Raw 200g", "Almonds Roasted 200g", "Trail Mix 200g",
            "Popcorn Butter 100g", "Popcorn Caramel 100g", "Nachos Cheese 150g",
            "Nachos Salsa 150g", "Makhana Roasted 100g", "Granola Bar Choco 6pc",
            "Granola Bar Honey 6pc", "Pretzels Salted 150g", "Rice Cakes 100g",
            "Banana Chips 200g", "Murukku 200g", "Chakli 200g",
            "Corn Puffs 100g",
        ],
    },
    "Personal Care": {
        "prefix": "PCAR",
        "uom": "Piece",
        "price_range": (30, 800),
        "hsn": "3401",
        "tax_rate": 18.0,
        "items": [
            "Soap Bar Neem 100g", "Soap Bar Lavender 100g", "Soap Bar Charcoal 100g",
            "Shampoo Anti-Dandruff 200ml", "Shampoo Herbal 200ml",
            "Conditioner Smooth 200ml", "Face Wash Neem 100ml",
            "Face Wash Charcoal 100ml", "Face Cream Daily 50g",
            "Sunscreen SPF50 50ml", "Body Lotion Aloe 200ml",
            "Body Lotion Cocoa 200ml", "Toothpaste Mint 100g",
            "Toothpaste Herbal 100g", "Toothbrush Soft", "Toothbrush Medium",
            "Hand Wash Liquid 250ml", "Hand Sanitizer 200ml",
            "Deodorant Spray Cool 150ml", "Deodorant Spray Fresh 150ml",
            "Lip Balm SPF 4g", "Talcum Powder 200g", "Hair Oil Coconut 200ml",
            "Hair Oil Almond 200ml", "Hair Gel Strong 100ml",
        ],
    },
    "Household": {
        "prefix": "HSLD",
        "uom": "Piece",
        "price_range": (20, 600),
        "hsn": "3402",
        "tax_rate": 18.0,
        "items": [
            "Dish Soap Liquid Lemon 500ml", "Dish Soap Liquid Lime 500ml",
            "Floor Cleaner Pine 1L", "Floor Cleaner Lavender 1L",
            "Toilet Cleaner 500ml", "Glass Cleaner Spray 500ml",
            "Laundry Detergent Powder 1kg", "Laundry Detergent Powder 2kg",
            "Laundry Detergent Liquid 1L", "Fabric Softener 1L",
            "Sponge Scrub Pack 3", "Steel Wool Pack 5",
            "Trash Bags Large 30pc", "Trash Bags Medium 50pc",
            "Paper Towels Roll 2pc", "Tissue Box 200pc",
            "Aluminum Foil 10m", "Cling Wrap 30m", "Zip Bags Medium 25pc",
            "Air Freshener Spray 250ml", "Naphthalene Balls 200g",
            "Broom Plastic", "Mop Flat Microfiber", "Dustpan Set",
            "Bucket Plastic 15L",
        ],
    },
    "Stationery": {
        "prefix": "STAT",
        "uom": "Piece",
        "price_range": (10, 500),
        "hsn": "4820",
        "tax_rate": 12.0,
        "items": [
            "Pen Ballpoint Blue Pack 10", "Pen Ballpoint Black Pack 10",
            "Pen Gel Blue Pack 5", "Pen Gel Black Pack 5",
            "Pencil HB Pack 12", "Pencil 2B Pack 12",
            "Eraser White Pack 5", "Sharpener Double Pack 3",
            "Notebook Ruled 200pg", "Notebook Unruled 200pg",
            "Register A4 400pg", "Sticky Notes 3x3 Pack",
            "Marker Permanent Black", "Marker Whiteboard Set 4",
            "Highlighter Set 5 Colors", "Correction Pen",
            "Stapler Medium", "Staple Pins Box", "Paper Clips Box 100",
            "Glue Stick 40g", "Scissor Medium", "Ruler 30cm",
            "Tape Roll Clear", "Envelope White A4 25pc",
            "File Folder Set 5",
        ],
    },
    "Frozen Foods": {
        "prefix": "FRZN",
        "uom": "Pack",
        "price_range": (50, 600),
        "hsn": "1602",
        "tax_rate": 12.0,
        "items": [
            "Frozen Peas 500g", "Frozen Corn 500g", "Frozen Mixed Veg 500g",
            "Frozen French Fries 500g", "Frozen Potato Wedges 500g",
            "Frozen Chicken Nuggets 500g", "Frozen Fish Fingers 300g",
            "Frozen Samosa 12pcs", "Frozen Spring Roll 10pcs",
            "Frozen Paratha Plain 5pcs", "Frozen Paratha Laccha 5pcs",
            "Frozen Pizza Margherita", "Frozen Pizza Pepperoni",
            "Frozen Momos Veg 20pcs", "Frozen Momos Chicken 20pcs",
            "Ice Cream Vanilla 500ml", "Ice Cream Chocolate 500ml",
            "Ice Cream Strawberry 500ml", "Ice Cream Mango 500ml",
            "Frozen Paneer Tikka 300g",
        ],
    },
    "Baby Care": {
        "prefix": "BABY",
        "uom": "Pack",
        "price_range": (80, 1200),
        "hsn": "9619",
        "tax_rate": 12.0,
        "items": [
            "Diapers Newborn 30pc", "Diapers Small 30pc", "Diapers Medium 30pc",
            "Diapers Large 30pc", "Baby Wipes 80pc", "Baby Wipes 160pc",
            "Baby Powder 200g", "Baby Oil 200ml", "Baby Shampoo 200ml",
            "Baby Soap Bar 100g", "Baby Lotion 200ml", "Baby Cream 50g",
            "Baby Cereal Rice 300g", "Baby Cereal Wheat 300g",
            "Baby Bottle 250ml", "Sippy Cup 200ml", "Teether Ring",
            "Baby Bib Pack 3", "Baby Towel Set", "Baby Blanket Soft",
        ],
    },
    "Pet Supplies": {
        "prefix": "PETS",
        "uom": "Pack",
        "price_range": (50, 1500),
        "hsn": "2309",
        "tax_rate": 18.0,
        "items": [
            "Dog Food Dry 3kg", "Dog Food Dry 10kg", "Dog Food Wet 400g",
            "Cat Food Dry 1.5kg", "Cat Food Dry 3kg", "Cat Food Wet 400g",
            "Dog Treat Bone Pack 5", "Cat Treat Fish Pack 10",
            "Pet Shampoo 200ml", "Pet Brush Round",
            "Dog Leash Nylon 1.5m", "Dog Collar Medium",
            "Cat Litter 5kg", "Cat Litter 10kg",
            "Fish Food Pellets 100g", "Fish Tank Filter Small",
            "Bird Seed Mix 500g", "Pet Bowl Steel Medium",
            "Pet Toy Ball", "Pet Bed Small",
        ],
    },
    "Produce": {
        "prefix": "PROD",
        "uom": "Kg",
        "price_range": (15, 400),
        "hsn": "0702",
        "tax_rate": 0.0,
        "items": [
            "Tomato Fresh 1kg", "Onion Fresh 1kg", "Potato Fresh 1kg",
            "Green Chili 250g", "Ginger Fresh 250g", "Garlic Fresh 250g",
            "Cucumber Fresh 500g", "Carrot Fresh 500g", "Capsicum Green 500g",
            "Capsicum Red 250g", "Broccoli Fresh 500g", "Cauliflower Head",
            "Cabbage Green Head", "Spinach Bunch", "Coriander Bunch",
            "Mint Bunch", "Lemon 500g", "Apple Red 1kg",
            "Banana Fresh 1kg", "Orange Fresh 1kg", "Mango Fresh 1kg",
            "Grapes Green 500g", "Grapes Black 500g", "Papaya Fresh 1kg",
            "Watermelon Whole",
        ],
    },
    "Health & Wellness": {
        "prefix": "HLTH",
        "uom": "Pack",
        "price_range": (100, 2000),
        "hsn": "3004",
        "tax_rate": 12.0,
        "items": [
            "Multivitamin Tablets 60pc", "Vitamin C Tablets 30pc",
            "Vitamin D3 Tablets 60pc", "Calcium Tablets 60pc",
            "Omega-3 Capsules 30pc", "Iron Supplements 30pc",
            "Protein Powder Whey 500g", "Protein Powder Whey 1kg",
            "Protein Bar Chocolate 6pc", "Protein Bar Peanut 6pc",
            "Electrolyte Powder Sachet 10pc", "ORS Sachet Pack 10",
            "Band-Aid Assorted 50pc", "Cotton Roll 100g",
            "Thermometer Digital", "BP Monitor Digital",
            "Hand Grip Exerciser", "Yoga Mat 6mm",
            "Resistance Band Set", "Knee Support Band",
        ],
    },
}


# ============================================================================
# LOCATION DEFINITIONS
# ============================================================================

NEW_LOCATIONS = [
    ("Electronics Zone", "Display area for electronics and gadgets", "store"),
    ("Clothing Rack Area", "Apparel and clothing display section", "store"),
    ("Grocery Shelf A", "Main grocery shelf near entrance", "store"),
    ("Grocery Shelf B", "Secondary grocery shelf near billing", "store"),
    ("Frozen Section", "Refrigerated display for frozen items", "store"),
    ("Health & Beauty Aisle", "Personal care and health products", "store"),
    ("Baby & Pet Corner", "Baby care and pet supplies area", "store"),
    ("Main Warehouse", "Primary warehouse for bulk storage", "warehouse"),
    ("Cold Storage Unit", "Temperature-controlled warehouse unit", "warehouse"),
    ("Overflow Storage", "Secondary warehouse for seasonal overflow", "warehouse"),
]


# ============================================================================
# SUPPLIER DEFINITIONS
# ============================================================================

SUPPLIER_COMPANIES = [
    ("Reliance Fresh Distributors", "Mumbai", "Amit Sharma"),
    ("Metro Cash & Carry India", "Delhi", "Priya Verma"),
    ("ITC Distribution Network", "Kolkata", "Rahul Mehta"),
    ("HUL Supply Chain Services", "Bangalore", "Sunita Reddy"),
    ("Nestlé India Logistics", "Gurgaon", "Vikram Singh"),
    ("P&G Distribution India", "Hyderabad", "Kavya Nair"),
    ("Godrej Consumer Supply", "Mumbai", "Rajesh Patel"),
    ("Emami Wholesale Partners", "Kolkata", "Deepa Chatterjee"),
    ("Dabur Supply Services", "Noida", "Manish Gupta"),
    ("Marico Distribution Hub", "Chennai", "Lakshmi Iyer"),
    ("Patanjali Mega Distributors", "Haridwar", "Yogesh Kumar"),
    ("Amul Cooperative Supply", "Anand", "Nilesh Desai"),
    ("Mother Dairy Network", "Delhi", "Sanjay Tiwari"),
    ("BigBasket Wholesale", "Bangalore", "Anita Hegde"),
    ("DMart Supply Chain", "Pune", "Suresh Joshi"),
]

# HSN code mapping for categories
CATEGORY_HSN = {cat: info["hsn"] for cat, info in CATEGORIES.items()}
CATEGORY_TAX = {cat: info["tax_rate"] for cat, info in CATEGORIES.items()}


# ============================================================================
# MAIN SEEDING FUNCTION
# ============================================================================

def seed_data():
    conn = get_db_connection()
    cur = conn.cursor()

    print("=" * 60)
    print("  INVENTORY MANAGER - DATABASE SEEDER")
    print("  Simulating Full Store Workflow")
    print("=" * 60)

    try:
        # ================================================================
        # STEP 1: CREATE SUPPLIERS
        # ================================================================
        print("\n[1/9] Creating 15 Suppliers...")
        supplier_ids = []

        for name, city, contact in SUPPLIER_COMPANIES:
            phone = f"+91-{random.randint(70000, 99999)}-{random.randint(10000, 99999)}"
            email = name.lower().replace(" ", ".").replace("&", "and")[:30] + "@supply.in"

            cur.execute("SELECT id FROM suppliers WHERE email = %s", (email,))
            res = cur.fetchone()
            if res:
                supplier_ids.append(res[0])
                print(f"   [=] Supplier exists: {name}")
            else:
                cur.execute(
                    """
                    INSERT INTO suppliers (name, location, contact_person, phone_number, email, created_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    RETURNING id;
                    """,
                    (name, city, contact, phone, email),
                )
                sid = cur.fetchone()[0]
                supplier_ids.append(sid)
                print(f"   [+] Created supplier: {name} (ID={sid})")

        # ================================================================
        # STEP 2: CREATE LOCATIONS
        # ================================================================
        print("\n[2/9] Creating 10 Locations...")
        location_ids = []

        for loc_name, description, loc_type in NEW_LOCATIONS:
            cur.execute("SELECT id FROM locations WHERE name = %s", (loc_name,))
            res = cur.fetchone()
            if res:
                location_ids.append(res[0])
                print(f"   [=] Location exists: {loc_name}")
            else:
                cur.execute(
                    """
                    INSERT INTO locations (name, description, location_type, created_at)
                    VALUES (%s, %s, %s, NOW())
                    RETURNING id;
                    """,
                    (loc_name, description, loc_type),
                )
                lid = cur.fetchone()[0]
                location_ids.append(lid)
                print(f"   [+] Created location: {loc_name} (ID={lid})")

        # Separate store and warehouse IDs
        store_location_ids = []
        warehouse_location_ids = []
        for i, (_, _, lt) in enumerate(NEW_LOCATIONS):
            if lt == "store":
                store_location_ids.append(location_ids[i])
            else:
                warehouse_location_ids.append(location_ids[i])

        # ================================================================
        # STEP 3: CREATE 500 PRODUCTS
        # ================================================================
        print("\n[3/9] Creating 500 Products...")
        # Each entry: (product_id, name, selling_price, category, supplier_id, average_cost, sku, hsn, tax_rate)
        product_data = []
        product_count = 0
        global_sku_counter = 1

        for cat_name, cat_info in CATEGORIES.items():
            prefix = cat_info["prefix"]
            uom = cat_info["uom"]
            price_lo, price_hi = cat_info["price_range"]
            hsn = cat_info["hsn"]
            tax_rate = cat_info["tax_rate"]

            for item_name in cat_info["items"]:
                sku = f"{prefix}-{global_sku_counter:04d}"
                global_sku_counter += 1

                selling_price = round(random.uniform(price_lo, price_hi), 2)
                cost_ratio = random.uniform(0.55, 0.80)
                average_cost = round(selling_price * cost_ratio, 2)
                supplier_id = random.choice(supplier_ids)
                barcode = f"89{random.randint(10000000000, 99999999999)}"
                low_stock_threshold = random.choice([10, 15, 20, 25, 30])
                shelf_restock_threshold = random.choice([3, 5, 8, 10])

                cur.execute("SELECT id FROM products WHERE sku = %s", (sku,))
                res = cur.fetchone()

                if res:
                    product_data.append((res[0], item_name, selling_price, cat_name, supplier_id, average_cost, sku, hsn, tax_rate))
                    continue

                cur.execute(
                    """
                    INSERT INTO products (
                        sku, name, selling_price, average_cost, supplier_id,
                        category, unit_of_measure, barcode,
                        low_stock_threshold, shelf_restock_threshold, created_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    RETURNING id;
                    """,
                    (
                        sku, item_name, selling_price, average_cost, supplier_id,
                        cat_name, uom, barcode,
                        low_stock_threshold, shelf_restock_threshold,
                    ),
                )
                pid = cur.fetchone()[0]
                product_data.append((pid, item_name, selling_price, cat_name, supplier_id, average_cost, sku, hsn, tax_rate))
                product_count += 1

        print(f"   [+] Created {product_count} new products (total catalog: {len(product_data)})")

        # ================================================================
        # STEP 4: CREATE PRODUCT-SUPPLIER LINKS (PREFERRED)
        # ================================================================
        print("\n[4/9] Assigning Preferred Suppliers...")
        link_count = 0

        for pid, name, sell_price, cat, sid, avg_cost, sku, hsn, tax in product_data:
            cur.execute(
                """
                INSERT INTO product_suppliers (product_id, supplier_id, supply_price, supplier_sku, is_preferred)
                VALUES (%s, %s, %s, %s, TRUE)
                ON CONFLICT (product_id, supplier_id) DO NOTHING;
                """,
                (pid, sid, avg_cost, f"SUP-{pid}-{sid}"),
            )
            if cur.rowcount > 0:
                link_count += 1

            # Secondary supplier for ~40%
            if random.random() < 0.4:
                alt_supplier = random.choice([s for s in supplier_ids if s != sid])
                alt_price = round(avg_cost * random.uniform(0.95, 1.15), 2)
                cur.execute(
                    """
                    INSERT INTO product_suppliers (product_id, supplier_id, supply_price, supplier_sku, is_preferred)
                    VALUES (%s, %s, %s, %s, FALSE)
                    ON CONFLICT (product_id, supplier_id) DO NOTHING;
                    """,
                    (pid, alt_supplier, alt_price, f"SUP-{pid}-{alt_supplier}"),
                )

        print(f"   [+] Created {link_count} new preferred supplier links")

        # ================================================================
        # STEP 5: CREATE PURCHASE ORDERS (Grouped by supplier)
        # ================================================================
        print("\n[5/9] Creating Purchase Orders...")

        # Get a created_by user id (first available manager/admin)
        cur.execute("SELECT id, username FROM users LIMIT 1")
        user_row = cur.fetchone()
        created_by_id = user_row[0] if user_row else None
        created_by_name = user_row[1] if user_row else "system"

        # Group products by supplier
        supplier_product_map = {}
        for pid, name, sell_price, cat, sid, avg_cost, sku, hsn, tax in product_data:
            if sid not in supplier_product_map:
                supplier_product_map[sid] = []
            supplier_product_map[sid].append((pid, name, avg_cost, sku, cat, hsn, tax))

        po_records = []  # (po_id, supplier_id, items_list, po_date, total_amount)
        po_count = 0

        for supplier_id, products in supplier_product_map.items():
            # Split products into batches of ~30 for multiple POs per supplier
            batch_size = random.randint(20, 40)
            for batch_start in range(0, len(products), batch_size):
                batch = products[batch_start:batch_start + batch_size]
                if not batch:
                    continue

                po_date = datetime.now() - timedelta(days=random.randint(10, 90))
                expected_date = (po_date + timedelta(days=random.randint(3, 14))).date()

                cur.execute("SELECT id FROM suppliers WHERE id = %s", (supplier_id,))
                if not cur.fetchone():
                    continue

                cur.execute(
                    """
                    INSERT INTO purchase_orders (supplier_id, status, total_amount, expected_date, notes, created_by, created_at)
                    VALUES (%s, 'received', 0, %s, %s, %s, %s)
                    RETURNING id;
                    """,
                    (supplier_id, expected_date, f"Regular stock replenishment order", created_by_id, po_date),
                )
                po_id = cur.fetchone()[0]

                total_amount = 0.0
                po_items = []
                for pid, pname, unit_cost, psku, cat, hsn, tax in batch:
                    qty = random.randint(20, 200)
                    line_total = round(qty * unit_cost, 2)
                    total_amount += line_total

                    cur.execute(
                        """
                        INSERT INTO purchase_order_items (po_id, product_id, quantity_ordered, unit_cost)
                        VALUES (%s, %s, %s, %s)
                        RETURNING id;
                        """,
                        (po_id, pid, qty, unit_cost),
                    )
                    poi_id = cur.fetchone()[0]
                    po_items.append((poi_id, pid, pname, qty, unit_cost, cat, hsn, tax))

                total_amount = round(total_amount, 2)
                cur.execute("UPDATE purchase_orders SET total_amount = %s WHERE id = %s", (total_amount, po_id))

                po_records.append((po_id, supplier_id, po_items, po_date, total_amount))
                po_count += 1

        print(f"   [+] Created {po_count} purchase orders")

        # ================================================================
        # STEP 6: CREATE SUPPLIER INVOICES
        # ================================================================
        print("\n[6/9] Creating Supplier Invoices...")
        invoice_count = 0

        for po_id, supplier_id, po_items, po_date, total_amount in po_records:
            invoice_date = (po_date + timedelta(days=random.randint(1, 5))).date()
            received_date = (po_date + timedelta(days=random.randint(3, 10))).date()
            payment_due_date = (po_date + timedelta(days=random.randint(15, 45))).date()
            invoice_number = f"INV-{supplier_id}-{po_id}-{invoice_date.strftime('%Y%m%d')}"

            # Calculate subtotal and tax
            subtotal = total_amount
            # Use average tax rate from items
            avg_tax_rate = 0.0
            if po_items:
                avg_tax_rate = sum(item[7] for item in po_items) / len(po_items)
            tax_amount = round(subtotal * avg_tax_rate / 100, 2)
            grand_total = round(subtotal + tax_amount, 2)

            # Randomly mark some as paid
            payment_status = random.choice(["paid", "paid", "paid", "unpaid", "partial"])

            cur.execute(
                """
                INSERT INTO supplier_invoices
                (po_id, supplier_id, invoice_number, invoice_date, received_date,
                 subtotal, tax_amount, total_amount, payment_status, payment_due_date,
                 notes, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
                """,
                (
                    po_id, supplier_id, invoice_number, invoice_date, received_date,
                    subtotal, tax_amount, grand_total, payment_status, payment_due_date,
                    f"Invoice for PO #{po_id}", created_by_name,
                ),
            )
            invoice_id = cur.fetchone()[0]

            # Create supplier_invoice_items
            for poi_id, pid, pname, qty, unit_cost, cat, hsn, tax_rate in po_items:
                line_total = round(qty * unit_cost, 2)
                cur.execute(
                    """
                    INSERT INTO supplier_invoice_items
                    (invoice_id, po_item_id, product_id, product_name,
                     invoiced_qty, unit_cost, line_total, hsn_code, tax_rate)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (invoice_id, poi_id, pid, pname, qty, unit_cost, line_total, hsn, tax_rate),
                )

            # ============================================================
            # STEP 6b: CREATE GRN RECORD (Goods Receipt Note)
            # ============================================================
            cur.execute(
                """
                INSERT INTO goods_receipt_notes
                (po_id, invoice_id, received_by, status, warehouse_id, completed_at, created_at)
                VALUES (%s, %s, %s, 'completed', %s, %s, %s)
                RETURNING id;
                """,
                (
                    po_id, invoice_id, created_by_name,
                    random.choice(warehouse_location_ids),
                    received_date,
                    po_date + timedelta(days=random.randint(2, 7)),
                ),
            )
            grn_id = cur.fetchone()[0]

            # Create grn_items (all approved — completed GRN)
            for poi_id, pid, pname, qty, unit_cost, cat, hsn, tax_rate in po_items:
                # Find the invoice item we just created
                cur.execute(
                    "SELECT id FROM supplier_invoice_items WHERE invoice_id = %s AND product_id = %s LIMIT 1",
                    (invoice_id, pid),
                )
                inv_item_row = cur.fetchone()
                invoice_item_id = inv_item_row[0] if inv_item_row else None

                # Look up the product barcode
                cur.execute("SELECT barcode FROM products WHERE id = %s", (pid,))
                barcode_row = cur.fetchone()
                barcode = barcode_row[0] if barcode_row and barcode_row[0] else f"89{random.randint(10000000000, 99999999999)}"

                internal_code = f"INT-GRN{grn_id}-P{pid}-{uuid.uuid4().hex[:8].upper()}"

                cur.execute(
                    """
                    INSERT INTO grn_items
                    (grn_id, invoice_item_id, po_item_id, product_id,
                     ordered_qty, invoiced_qty, received_qty, unit_cost,
                     universal_barcode, internal_code, qa_status, scanned_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'approved', %s);
                    """,
                    (
                        grn_id, invoice_item_id, poi_id, pid,
                        qty, qty, qty, unit_cost,
                        barcode, internal_code, received_date,
                    ),
                )

            invoice_count += 1

        print(f"   [+] Created {invoice_count} supplier invoices with GRN records")

        # ================================================================
        # STEP 7: CREATE INVENTORY BATCHES (from completed GRNs)
        # ================================================================
        print("\n[7/9] Creating Inventory Batches...")
        batch_count = 0

        for po_id, supplier_id, po_items, po_date, total_amount in po_records:
            received_date = po_date + timedelta(days=random.randint(3, 10))
            batch_code = f"PO-{po_id}-{received_date.strftime('%Y%m%d')}"

            for poi_id, pid, pname, qty, unit_cost, cat, hsn, tax_rate in po_items:
                # Check if inventory already exists from this PO
                cur.execute(
                    "SELECT id FROM inventory_batches WHERE product_id = %s AND batch_code = %s LIMIT 1",
                    (pid, batch_code),
                )
                if cur.fetchone():
                    continue

                # Perishable items get shorter expiry
                if cat in ("Dairy", "Bakery", "Produce", "Frozen Foods"):
                    days_to_expiry = random.randint(5, 30)
                    loc_id = random.choice(store_location_ids + warehouse_location_ids[:1])
                else:
                    days_to_expiry = random.randint(90, 730)
                    loc_id = random.choice(location_ids)

                expiry_date = datetime.now() + timedelta(days=days_to_expiry)

                cur.execute(
                    """
                    INSERT INTO inventory_batches (
                        product_id, location_id, batch_code, quantity,
                        expiry_date, received_at, unit_cost
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s);
                    """,
                    (pid, loc_id, batch_code, qty, expiry_date, received_date, unit_cost),
                )
                batch_count += 1

        print(f"   [+] Created {batch_count} inventory batches")

        # ================================================================
        # STEP 8: CREATE USERS (for sales orders)
        # ================================================================
        print("\n[8/9] Ensuring Customer Users Exist...")

        cur.execute("SELECT id FROM roles WHERE name = 'customer'")
        role_res = cur.fetchone()
        if not role_res:
            cur.execute("INSERT INTO roles (name, description) VALUES ('customer', 'Regular Customer') RETURNING id")
            customer_role_id = cur.fetchone()[0]
        else:
            customer_role_id = role_res[0]

        users_list = []
        for _ in range(15):
            email = fake.unique.email()
            username = email.split("@")[0]
            phone_number = f"+91{random.randint(7000000000, 9999999999)}"

            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            res = cur.fetchone()
            if res:
                uid = res[0]
            else:
                cur.execute("SELECT id FROM users WHERE phone_number = %s", (phone_number,))
                res = cur.fetchone()
                if res:
                    uid = res[0]
                else:
                    cur.execute(
                        """
                        INSERT INTO users (username, email, password_hash, is_active, phone_number)
                        VALUES (%s, %s, 'hash_placeholder', TRUE, %s)
                        RETURNING id;
                        """,
                        (username, email, phone_number),
                    )
                    uid = cur.fetchone()[0]

            cur.execute("SELECT 1 FROM user_roles WHERE user_id=%s AND role_id=%s", (uid, customer_role_id))
            if not cur.fetchone():
                cur.execute("INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s)", (uid, customer_role_id))

            users_list.append({"id": uid, "name": fake.name(), "email": email, "phone": phone_number})

        print(f"   [+] Ensured {len(users_list)} customer users")

        # ================================================================
        # STEP 9: CREATE 300 SALES ORDERS
        # ================================================================
        print("\n[9/9] Generating 300 Sales Orders...")
        payment_methods = ["cash", "upi", "card"]
        order_count = 0

        for i in range(300):
            order_date = fake.date_time_between(start_date="-90d", end_date="now")

            # 70% linked to a registered customer, 30% walk-in
            if users_list and random.random() < 0.7:
                u = random.choice(users_list)
                c_name = u["name"]
                c_email = u["email"]
                c_phone = u["phone"]
                uid = u["id"]
            else:
                c_name = fake.name()
                c_email = fake.email()
                c_phone = f"+91{random.randint(7000000000, 9999999999)}"
                uid = None

            payment_method = random.choice(payment_methods)
            payment_ref = None
            if payment_method == "upi":
                payment_ref = f"UPI-{random.randint(100000000, 999999999)}"
            elif payment_method == "card":
                payment_ref = f"CARD-XXXX-{random.randint(1000, 9999)}"

            # Pick 1-5 products
            num_items = random.randint(1, 5)
            selected = random.sample(product_data, min(num_items, len(product_data)))

            items_to_insert = []
            total_amount = 0.0

            for pid, pname, sell_price, cat, sid, avg_cost, psku, hsn, tax in selected:
                qty = random.randint(1, 4)
                line_total = round(sell_price * qty, 2)
                total_amount += line_total
                items_to_insert.append((pid, qty, sell_price, avg_cost))

            total_amount = round(total_amount, 2)

            cur.execute(
                """
                INSERT INTO sales_orders (
                    customer_name, customer_email, customer_phone,
                    total_amount, sales_channel, status, fulfillment_method,
                    order_timestamp, payment_method, payment_reference, user_id
                )
                VALUES (%s, %s, %s, %s, 'in-store', 'completed', 'POS', %s, %s, %s, %s)
                RETURNING id;
                """,
                (c_name, c_email, c_phone, total_amount, order_date, payment_method, payment_ref, uid),
            )
            order_id = cur.fetchone()[0]

            for pid, qty, unit_price, unit_cost in items_to_insert:
                cur.execute(
                    """
                    INSERT INTO sales_order_items (order_id, product_id, quantity, unit_price, unit_cost)
                    VALUES (%s, %s, %s, %s, %s);
                    """,
                    (order_id, pid, qty, unit_price, unit_cost),
                )

            order_count += 1
            if (i + 1) % 50 == 0:
                print(f"   ... {i + 1}/300 orders created")

        print(f"   [+] Created {order_count} sales orders")

        # ================================================================
        # COMMIT & SUMMARY
        # ================================================================
        conn.commit()

        print("\n" + "=" * 60)
        print("  SEEDING COMPLETE!")
        print("=" * 60)

        cur.execute("SELECT COUNT(*) FROM suppliers")
        print(f"  Total Suppliers:            {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM locations")
        print(f"  Total Locations:            {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM products")
        print(f"  Total Products:             {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM product_suppliers WHERE is_preferred = TRUE")
        print(f"  Preferred Supplier Links:   {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM purchase_orders")
        print(f"  Total Purchase Orders:      {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM purchase_order_items")
        print(f"  Total PO Line Items:        {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM supplier_invoices")
        print(f"  Total Supplier Invoices:    {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM supplier_invoice_items")
        print(f"  Total Invoice Line Items:   {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM goods_receipt_notes")
        print(f"  Total GRN Records:          {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM grn_items")
        print(f"  Total GRN Items:            {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM inventory_batches")
        print(f"  Total Inventory Batches:    {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM sales_orders")
        print(f"  Total Sales Orders:         {cur.fetchone()[0]}")
        cur.execute("SELECT COUNT(*) FROM sales_order_items")
        print(f"  Total Sales Line Items:     {cur.fetchone()[0]}")
        print("=" * 60)

    except Exception as e:
        conn.rollback()
        print(f"\n[CRITICAL ERROR] {e}")
        import traceback
        traceback.print_exc()
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    seed_data()
