"""
Khata & Invoice System Migration Script
Run this to create all necessary tables for B2C credit (khata) and invoicing.
"""

import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def run_migration():
    """Execute the khata and invoice tables migration."""
    
    conn = None
    try:
        # Connect to database
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME", "postgres"),
            user=os.getenv("DB_USER", "postgres"),
            password=os.getenv("DB_PASS", "postgres"),
            host=os.getenv("DB_HOST", "localhost"),
            port=os.getenv("DB_PORT", "5432")
        )
        conn.autocommit = False
        cur = conn.cursor()
        
        print("=" * 60)
        print("KHATA & INVOICE SYSTEM MIGRATION")
        print("=" * 60)
        
        # Read migration file
        migration_path = os.path.join(
            os.path.dirname(__file__), 
            'migrations', 
            'create_khata_invoice_tables.sql'
        )
        
        with open(migration_path, 'r', encoding='utf-8') as f:
            migration_sql = f.read()
        
        print("\n[1/5] Creating khata_customers table...")
        print("[2/5] Creating khata_transactions table...")
        print("[3/5] Creating invoices & invoice_items tables...")
        print("[4/5] Creating business_settings table...")
        print("[5/5] Creating triggers and views...")
        
        # Execute migration
        cur.execute(migration_sql)
        conn.commit()
        
        print("\n✅ Migration completed successfully!")
        
        # Verify tables created
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN (
                'khata_customers', 
                'khata_transactions', 
                'invoices', 
                'invoice_items',
                'business_settings',
                'invoice_sequences',
                'khata_reminders'
            )
            ORDER BY table_name;
        """)
        tables = cur.fetchall()
        
        print("\n📋 Tables created:")
        for table in tables:
            print(f"   ✓ {table[0]}")
        
        # Check triggers
        cur.execute("""
            SELECT trigger_name, event_object_table 
            FROM information_schema.triggers 
            WHERE trigger_name IN (
                'trg_update_khata_balance',
                'trg_generate_invoice_number',
                'trg_update_invoice_timestamp'
            );
        """)
        triggers = cur.fetchall()
        
        print("\n⚡ Triggers created:")
        for trigger in triggers:
            print(f"   ✓ {trigger[0]} on {trigger[1]}")
        
        # Check views
        cur.execute("""
            SELECT viewname 
            FROM pg_views 
            WHERE schemaname = 'public'
            AND viewname IN ('v_khata_dashboard', 'v_khata_aging', 'v_invoice_summary');
        """)
        views = cur.fetchall()
        
        print("\n👁️ Views created:")
        for view in views:
            print(f"   ✓ {view[0]}")
        
        # Check default settings
        cur.execute("SELECT COUNT(*) FROM business_settings;")
        settings_count = cur.fetchone()[0]
        print(f"\n⚙️ Business settings initialized: {settings_count} entries")
        
        cur.close()
        
        print("\n" + "=" * 60)
        print("MIGRATION COMPLETE!")
        print("=" * 60)
        print("\nNext steps:")
        print("1. Update business_settings with your store details")
        print("2. Configure UPI settings for payment links")
        print("3. Restart the API server")
        
        return True
        
    except psycopg2.Error as e:
        print(f"\n❌ Database error: {e}")
        if conn:
            conn.rollback()
        return False
    except FileNotFoundError:
        print(f"\n❌ Migration file not found at: {migration_path}")
        return False
    except Exception as e:
        print(f"\n❌ Error: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()


def verify_migration():
    """Verify the migration was successful."""
    
    conn = None
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME", "postgres"),
            user=os.getenv("DB_USER", "postgres"),
            password=os.getenv("DB_PASS", "postgres"),
            host=os.getenv("DB_HOST", "localhost"),
            port=os.getenv("DB_PORT", "5432")
        )
        cur = conn.cursor()
        
        # Test invoice number generation
        print("\n🧪 Testing invoice number generation...")
        cur.execute("""
            INSERT INTO invoices (
                invoice_type, customer_name, subtotal, total_amount
            ) VALUES ('RETAIL', 'Test Customer', 100, 100)
            RETURNING invoice_number;
        """)
        invoice_num = cur.fetchone()[0]
        print(f"   Generated: {invoice_num}")
        
        # Rollback test data
        conn.rollback()
        print("   (Test data rolled back)")
        
        print("\n✅ All verifications passed!")
        return True
        
    except Exception as e:
        print(f"\n❌ Verification failed: {e}")
        return False
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    success = run_migration()
    if success:
        verify_migration()
