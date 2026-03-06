"""
Migration: Add batch_tag columns to batch_tracking table
Adds: batch_tag, tag_discount_percent, tag_reason, tag_set_by, tag_set_at
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS")
    )

def run_migration():
    conn = get_connection()
    cur = conn.cursor()

    print("=== Migration: Batch Tag System ===\n")

    # --- Add batch_tag column ---
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'batch_tracking' AND column_name = 'batch_tag'
    """)
    if not cur.fetchone():
        cur.execute("""
            ALTER TABLE batch_tracking 
            ADD COLUMN batch_tag VARCHAR(20) DEFAULT 'normal'
        """)
        print("✅ Added batch_tag column (default: 'normal')")
    else:
        print("⏭️  batch_tag already exists")

    # --- Add tag_discount_percent column ---
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'batch_tracking' AND column_name = 'tag_discount_percent'
    """)
    if not cur.fetchone():
        cur.execute("""
            ALTER TABLE batch_tracking 
            ADD COLUMN tag_discount_percent DECIMAL(5,2) DEFAULT NULL
        """)
        print("✅ Added tag_discount_percent column")
    else:
        print("⏭️  tag_discount_percent already exists")

    # --- Add tag_reason column ---
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'batch_tracking' AND column_name = 'tag_reason'
    """)
    if not cur.fetchone():
        cur.execute("""
            ALTER TABLE batch_tracking 
            ADD COLUMN tag_reason TEXT DEFAULT NULL
        """)
        print("✅ Added tag_reason column")
    else:
        print("⏭️  tag_reason already exists")

    # --- Add tag_set_by column ---
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'batch_tracking' AND column_name = 'tag_set_by'
    """)
    if not cur.fetchone():
        cur.execute("""
            ALTER TABLE batch_tracking 
            ADD COLUMN tag_set_by VARCHAR(100) DEFAULT NULL
        """)
        print("✅ Added tag_set_by column")
    else:
        print("⏭️  tag_set_by already exists")

    # --- Add tag_set_at column ---
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'batch_tracking' AND column_name = 'tag_set_at'
    """)
    if not cur.fetchone():
        cur.execute("""
            ALTER TABLE batch_tracking 
            ADD COLUMN tag_set_at TIMESTAMP DEFAULT NULL
        """)
        print("✅ Added tag_set_at column")
    else:
        print("⏭️  tag_set_at already exists")

    # --- Create index on batch_tag for filtering ---
    cur.execute("""
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'batch_tracking' AND indexname = 'idx_batch_tracking_tag'
    """)
    if not cur.fetchone():
        cur.execute("""
            CREATE INDEX idx_batch_tracking_tag ON batch_tracking(batch_tag)
        """)
        print("✅ Created index on batch_tag")
    else:
        print("⏭️  Index already exists")

    conn.commit()
    cur.close()
    conn.close()
    print("\n✅ Migration complete!")

if __name__ == "__main__":
    run_migration()
