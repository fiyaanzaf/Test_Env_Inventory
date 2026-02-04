"""Create a test user for B2B API testing"""
from passlib.context import CryptContext
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')

# Create a test password hash
test_hash = pwd_context.hash('test123')

conn = psycopg2.connect(
    dbname=os.getenv('DB_NAME'),
    user=os.getenv('DB_USER'),
    password=os.getenv('DB_PASS'),
    host=os.getenv('DB_HOST'),
    port=os.getenv('DB_PORT')
)
cur = conn.cursor()

# Check if we have an owner role
cur.execute("SELECT id FROM roles WHERE name = 'owner'")
owner_role = cur.fetchone()
if not owner_role:
    cur.execute("INSERT INTO roles (name) VALUES ('owner') RETURNING id")
    owner_role_id = cur.fetchone()[0]
else:
    owner_role_id = owner_role[0]

# Get employee role
cur.execute("SELECT id FROM roles WHERE name = 'employee'")
emp_role = cur.fetchone()
emp_role_id = emp_role[0] if emp_role else None

# Create or update test_owner user
cur.execute("SELECT id FROM users WHERE username = 'test_owner'")
user = cur.fetchone()
if user:
    cur.execute("UPDATE users SET password_hash = %s WHERE username = 'test_owner'", (test_hash,))
    user_id = user[0]
    print(f'Updated existing test_owner user (ID: {user_id})')
else:
    cur.execute("INSERT INTO users (username, email, password_hash) VALUES ('test_owner', 'owner@test.com', %s) RETURNING id", (test_hash,))
    user_id = cur.fetchone()[0]
    print(f'Created new test_owner user (ID: {user_id})')

# Add owner role
cur.execute("INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (user_id, owner_role_id))

# Also add employee role for b2b access
if emp_role_id:
    cur.execute("INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (user_id, emp_role_id))

conn.commit()
conn.close()

print('='*40)
print('Test user created successfully!')
print('Username: test_owner')
print('Password: test123')
print('='*40)
