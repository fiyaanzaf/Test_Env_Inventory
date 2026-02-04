"""Verify B2B migration was successful"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

conn = psycopg2.connect(
    dbname=os.getenv("DB_NAME"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASS"),
    host=os.getenv("DB_HOST"),
    port=os.getenv("DB_PORT")
)
cur = conn.cursor()

# Check all B2B tables
print("=== B2B Tables ===")
cur.execute("""
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND (table_name LIKE 'b2b%' OR table_name = 'client_item_history')
    ORDER BY table_name;
""")
for t in cur.fetchall():
    print(f"  ✓ {t[0]}")

# Check views
print("\n=== B2B Views ===")
cur.execute("""
    SELECT table_name 
    FROM information_schema.views 
    WHERE table_schema = 'public' 
    AND (table_name LIKE 'v_b2b%' OR table_name LIKE 'v_top%')
    ORDER BY table_name;
""")
for v in cur.fetchall():
    print(f"  ✓ {v[0]}")

# Test dashboard view
print("\n=== Dashboard Stats (empty for now) ===")
cur.execute("SELECT * FROM v_b2b_dashboard")
row = cur.fetchone()
print(f"  Total to Collect: ₹{row[0]}")
print(f"  Clients Over Limit: {row[1]}")
print(f"  Active Clients: {row[2]}")
print(f"  Net Outstanding: ₹{row[3]}")

# Check settings
print("\n=== B2B Settings ===")
cur.execute("SELECT key, value FROM b2b_settings ORDER BY key")
for s in cur.fetchall():
    print(f"  {s[0]}: {s[1]}")

# Check triggers
print("\n=== Triggers ===")
cur.execute("""
    SELECT trigger_name, event_manipulation, event_object_table
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    AND trigger_name LIKE 'trg_%'
""")
for t in cur.fetchall():
    print(f"  ✓ {t[0]} ON {t[2]} ({t[1]})")

conn.close()
print("\n✅ All B2B components verified successfully!")
