"""Test B2B Order and Payment Flow"""
import requests

BASE_URL = "http://127.0.0.1:8001"

# Login
print("Logging in...")
login_resp = requests.post(f'{BASE_URL}/api/v1/users/login', data={'username': 'test_owner', 'password': 'test123'})
token = login_resp.json()['access_token']
headers = {'Authorization': f'Bearer {token}'}
print("✅ Logged in\n")

# Get a client
resp = requests.get(f'{BASE_URL}/api/v1/b2b/clients', headers=headers)
clients = resp.json()
if not clients:
    print("No clients found, creating one...")
    new_client = {
        'name': 'Test Wholesale Client',
        'contact_person': 'Test Person',
        'phone': '9999888877',
        'credit_limit': 50000,
        'price_tier': 'silver'
    }
    resp = requests.post(f'{BASE_URL}/api/v1/b2b/clients', headers=headers, json=new_client)
    client = resp.json()
else:
    client = clients[0]

client_id = client['id']
print(f"Using client: {client['name']} (ID: {client_id})")
print(f"Current Balance: ₹{client['current_balance']}")

# Get a product for the order
print("\nGetting products...")
resp = requests.get(f'{BASE_URL}/api/v1/products/', headers=headers)
products = resp.json()
if not products:
    print("❌ No products found in database. Cannot test orders.")
    exit()

product = products[0]
print(f"Using product: {product['name']} (ID: {product['id']}, Price: ₹{product['selling_price']})")

# Test last price lookup (should be None for first order)
resp = requests.get(f'{BASE_URL}/api/v1/b2b/clients/{client_id}/last-price/{product["id"]}', headers=headers)
print(f"\nLast Price Lookup: {resp.status_code}")
if resp.status_code == 200:
    price_info = resp.json()
    print(f"   Last sold price: {price_info.get('last_sold_price', 'N/A')}")
    print(f"   Standard price: ₹{price_info['standard_price']}")
    print(f"   Unit cost: ₹{price_info['unit_cost']}")

# Create a B2B order
print("\n=== Creating B2B Order ===")
order_data = {
    'client_id': client_id,
    'items': [
        {
            'product_id': product['id'],
            'quantity': 5,
            'unit_price': float(product['selling_price']) * 0.95  # 5% discount
        }
    ],
    'notes': 'Test B2B order'
}

resp = requests.post(f'{BASE_URL}/api/v1/b2b/orders', headers=headers, json=order_data)
print(f"Create Order: {resp.status_code}")
if resp.status_code == 200:
    order = resp.json()
    order_id = order['id']
    print(f"   ✅ Order created (ID: {order_id})")
    print(f"   Total Amount: ₹{order['total_amount']}")
    print(f"   Status: {order['status']}")
    print(f"   Payment Status: {order['payment_status']}")
    if order['items']:
        item = order['items'][0]
        print(f"   Item: {item['product_name']} x {item['quantity']} @ ₹{item['unit_price']}")
        if item.get('margin_percent'):
            print(f"   Margin: {item['margin_percent']:.1f}%")
else:
    print(f"   ❌ Error: {resp.text}")
    exit()

# Check client balance was updated
resp = requests.get(f'{BASE_URL}/api/v1/b2b/clients/{client_id}', headers=headers)
client = resp.json()
print(f"\nClient balance after order: ₹{client['current_balance']}")
print(f"Balance status: {client['balance_status']}")

# Check ledger
resp = requests.get(f'{BASE_URL}/api/v1/b2b/clients/{client_id}/ledger', headers=headers)
ledger = resp.json()
print(f"\nLedger entries: {len(ledger)}")
for txn in ledger[:3]:
    print(f"   {txn['type']}: ₹{txn['amount']} (Balance: ₹{txn['running_balance']})")

# Check frequent items now has the product
resp = requests.get(f'{BASE_URL}/api/v1/b2b/clients/{client_id}/frequent-items', headers=headers)
frequent = resp.json()
print(f"\nFrequent items: {len(frequent)}")
for item in frequent:
    print(f"   {item['product_name']}: {item['order_count']} orders, last @ ₹{item['last_sold_price']}")

# Record a payment
print("\n=== Recording Payment ===")
payment_amount = order['total_amount'] / 2  # Pay half
payment_data = {
    'client_id': client_id,
    'amount': payment_amount,
    'payment_mode': 'upi',
    'payment_reference': 'UPI-TEST-12345',
    'notes': 'Partial payment test'
}

resp = requests.post(f'{BASE_URL}/api/v1/b2b/payments', headers=headers, json=payment_data)
print(f"Record Payment: {resp.status_code}")
if resp.status_code == 200:
    payment = resp.json()
    print(f"   ✅ Payment recorded (ID: {payment['id']})")
    print(f"   Amount: ₹{payment['amount']}")
    print(f"   New Balance: ₹{payment['running_balance']}")
    print(f"   Payment Mode: {payment['payment_mode']}")
else:
    print(f"   ❌ Error: {resp.text}")

# Check client balance again
resp = requests.get(f'{BASE_URL}/api/v1/b2b/clients/{client_id}', headers=headers)
client = resp.json()
print(f"\nClient balance after payment: ₹{client['current_balance']}")

# Check order payment status
resp = requests.get(f'{BASE_URL}/api/v1/b2b/clients/{client_id}/orders', headers=headers)
orders = resp.json()
if orders:
    latest = orders[0]
    print(f"Order payment status: {latest['payment_status']} (₹{latest['amount_paid']} paid)")

# Test statement generation
print("\n=== Testing Statement PDF ===")
resp = requests.get(f'{BASE_URL}/api/v1/b2b/clients/{client_id}/statement?days=30', headers=headers)
print(f"Statement PDF: {resp.status_code}")
if resp.status_code == 200:
    print(f"   ✅ PDF generated ({len(resp.content)} bytes)")

# Dashboard check
print("\n=== Final Dashboard ===")
resp = requests.get(f'{BASE_URL}/api/v1/b2b/dashboard', headers=headers)
if resp.status_code == 200:
    dash = resp.json()
    print(f"Total to Collect: ₹{dash['total_to_collect']}")
    print(f"Active Clients: {dash['active_clients']}")
    print(f"Top Debtors: {len(dash['top_debtors'])}")

print("\n" + "="*50)
print("✅ B2B Order & Payment Flow Test Complete!")
print("="*50)
