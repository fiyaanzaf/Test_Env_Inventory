import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def upgrade_alerts_table():
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASS"),
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT")
        )
        cur = conn.cursor()
        
        print("Checking 'system_alerts' table schema...")
        
        # Check if 'status' column exists
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='system_alerts' AND column_name='status'")
        if not cur.fetchone():
            print("Adding 'status' column...")
            cur.execute("ALTER TABLE system_alerts ADD COLUMN status VARCHAR(50) DEFAULT 'open';")
            
            # Migrate existing data
            print("Migrating old data...")
            cur.execute("UPDATE system_alerts SET status = 'resolved' WHERE is_resolved = TRUE;")
            cur.execute("UPDATE system_alerts SET status = 'open' WHERE is_resolved = FALSE;")
            
            print("Migration complete.")
        else:
            print("'status' column already exists.")

        # Check if 'user_id' exists (to link reports to users)
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='system_alerts' AND column_name='user_id'")
        if not cur.fetchone():
            print("Adding 'user_id' column...")
            cur.execute("ALTER TABLE system_alerts ADD COLUMN user_id INTEGER REFERENCES users(id);")
            print("Linked alerts to users.")

        conn.commit()
        cur.close()
        conn.close()
        print("✅ Database Upgrade Successful!")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    upgrade_alerts_table()