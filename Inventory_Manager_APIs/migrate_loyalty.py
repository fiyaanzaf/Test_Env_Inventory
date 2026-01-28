"""
Migration Script: Loyalty Points System
Run this script to add loyalty points support to the database.

Usage: python migrate_loyalty.py
"""

import psycopg2
from dotenv import load_dotenv
import os

load_dotenv()

def get_db_connection():
    """Get database connection using environment variables."""
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        database=os.getenv("DB_NAME", "postgres"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASS")  # Using DB_PASS to match your .env file
    )

def run_migration():
    """Execute the loyalty points migration."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        print("Starting Loyalty Points Migration...")
        
        # 1. Add loyalty_points column to users table
        print("  [1/3] Adding loyalty_points column to users table...")
        cur.execute("""
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS loyalty_points INTEGER DEFAULT 0;
        """)
        
        # 2. Create loyalty_settings table
        print("  [2/3] Creating loyalty_settings table...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS loyalty_settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT NOT NULL,
                description TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by INTEGER REFERENCES users(id)
            );
        """)
        
        # 3. Insert default settings (if not exist)
        print("  [3/3] Inserting default loyalty settings...")
        cur.execute("""
            INSERT INTO loyalty_settings (key, value, description) VALUES
            ('earn_per_rupees', '50', 'Rupees spent to earn 1 point'),
            ('redeem_value', '1', 'Rupee value of 1 point when redeeming')
            ON CONFLICT (key) DO NOTHING;
        """)
        
        conn.commit()
        cur.close()
        
        print("\n[SUCCESS] Migration completed successfully!")
        print("   - Added 'loyalty_points' column to users table")
        print("   - Created 'loyalty_settings' table with default values")
        
    except Exception as e:
        print(f"\n[ERROR] Migration failed: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    run_migration()
