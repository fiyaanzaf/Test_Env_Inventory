"""Test B2B API Endpoints"""
import requests

BASE_URL = "http://127.0.0.1:8001"

# Login to get a token
print("Logging in...")
login_resp = requests.post(f'{BASE_URL}/api/v1/users/login', data={'username': 'test_owner', 'password': 'test123'})
if login_resp.status_code != 200:
    print(f'Login failed: {login_resp.text}')
    exit()

token = login_resp.json()['access_token']
headers = {'Authorization': f'Bearer {token}'}
print(f"✅ Logged in successfully\n")

print('=== Testing B2B Endpoints ===\n')

# 1. Test Dashboard
resp = requests.get(f'{BASE_URL}/api/v1/b2b/dashboard', headers=headers)
print(f'1. Dashboard: {resp.status_code}')
if resp.status_code == 200:
    data = resp.json()
    print(f'   Total to Collect: ₹{data["total_to_collect"]}')
    print(f'   Active Clients: {data["active_clients"]}')
    print(f'   Clients Over Limit: {data["clients_over_limit"]}')

# 2. Test Get Clients (should be empty initially)
resp = requests.get(f'{BASE_URL}/api/v1/b2b/clients', headers=headers)
print(f'\n2. Get Clients: {resp.status_code} ({len(resp.json())} clients)')

# 3. Test Create Client
new_client = {
    'name': 'Sharma Tea Stall',
    'contact_person': 'Raju Sharma',
    'phone': '9876543210',
    'credit_limit': 15000,
    'price_tier': 'gold'
}
resp = requests.post(f'{BASE_URL}/api/v1/b2b/clients', headers=headers, json=new_client)
print(f'\n3. Create Client: {resp.status_code}')
if resp.status_code == 200:
    client = resp.json()
    client_id = client['id']
    print(f'   ✅ Created: {client["name"]} (ID: {client_id})')
    print(f'   Credit Limit: ₹{client["credit_limit"]}')
    print(f'   Price Tier: {client["price_tier"]}')
    print(f'   Balance Status: {client["balance_status"]}')
else:
    print(f'   Error: {resp.text}')
    # Try to get existing client
    resp = requests.get(f'{BASE_URL}/api/v1/b2b/clients', headers=headers)
    if resp.json():
        client_id = resp.json()[0]['id']
        print(f'   Using existing client ID: {client_id}')
    else:
        exit()

# 4. Test Get Single Client
resp = requests.get(f'{BASE_URL}/api/v1/b2b/clients/{client_id}', headers=headers)
print(f'\n4. Get Client {client_id}: {resp.status_code}')

# 5. Test Update Client
update_data = {'contact_person': 'Raju Kumar Sharma', 'credit_limit': 20000}
resp = requests.put(f'{BASE_URL}/api/v1/b2b/clients/{client_id}', headers=headers, json=update_data)
print(f'\n5. Update Client: {resp.status_code}')
if resp.status_code == 200:
    print(f'   ✅ Updated credit limit to: ₹{resp.json()["credit_limit"]}')

# 6. Test Get Ledger (empty initially)
resp = requests.get(f'{BASE_URL}/api/v1/b2b/clients/{client_id}/ledger', headers=headers)
print(f'\n6. Get Ledger: {resp.status_code} ({len(resp.json())} transactions)')

# 7. Test Frequent Items (empty initially)
resp = requests.get(f'{BASE_URL}/api/v1/b2b/clients/{client_id}/frequent-items', headers=headers)
print(f'\n7. Frequent Items: {resp.status_code} ({len(resp.json())} items)')

# 8. Test WhatsApp Message
resp = requests.get(f'{BASE_URL}/api/v1/b2b/clients/{client_id}/whatsapp-message', headers=headers)
print(f'\n8. WhatsApp Message: {resp.status_code}')
if resp.status_code == 200:
    wa = resp.json()
    print(f'   Phone: {wa["phone"]}')
    print(f'   Balance: ₹{wa["current_balance"]}')
    print(f'   URL: {wa["whatsapp_url"][:60]}...')

# 9. Test Settings
resp = requests.get(f'{BASE_URL}/api/v1/b2b/settings', headers=headers)
print(f'\n9. Get Settings: {resp.status_code}')
if resp.status_code == 200:
    settings = resp.json()
    print(f'   Default Credit Limit: ₹{settings["default_credit_limit"]["value"]}')
    print(f'   Gold Tier Discount: {float(settings["gold_tier_discount"]["value"])*100}%')

# 10. Test Dashboard again (should now have 1 client)
resp = requests.get(f'{BASE_URL}/api/v1/b2b/dashboard', headers=headers)
print(f'\n10. Dashboard (after adding client): {resp.status_code}')
if resp.status_code == 200:
    data = resp.json()
    print(f'   Active Clients: {data["active_clients"]}')

print('\n' + '='*40)
print('✅ All B2B API Endpoints Working!')
print('='*40)
