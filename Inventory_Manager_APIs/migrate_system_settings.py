"""
Migration script to create system_settings table
"""
from security import get_db_connection

def run_migration():
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Create table
    cur.execute('''
        CREATE TABLE IF NOT EXISTS system_settings (
            key VARCHAR(100) PRIMARY KEY,
            value TEXT,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Insert default settings
    defaults = [
        ('business_name', 'My Business', 'Business name shown in emails and invoices'),
        ('business_phone', '', 'Business contact phone'),
        ('business_email', '', 'Business contact email'),
        ('business_address', '', 'Business address'),
        ('smtp_host', '', 'SMTP server hostname (e.g., smtp.gmail.com)'),
        ('smtp_port', '587', 'SMTP server port (usually 587 for TLS)'),
        ('smtp_user', '', 'SMTP username/email for authentication'),
        ('smtp_pass', '', 'SMTP password or app password'),
        ('smtp_from', '', 'From email address (defaults to smtp_user if empty)'),
        ('upi_id', '', 'UPI ID for payment QR codes'),
        ('gst_number', '', 'Business GST number')
    ]
    
    for key, value, desc in defaults:
        cur.execute('''
            INSERT INTO system_settings (key, value, description) 
            VALUES (%s, %s, %s) 
            ON CONFLICT (key) DO NOTHING
        ''', (key, value, desc))
    
    conn.commit()
    print('system_settings table created successfully!')
    
    # Show current settings
    cur.execute('SELECT key, value FROM system_settings ORDER BY key')
    for row in cur.fetchall():
        val = row[1] if row[1] else '(not set)'
        print(f'  {row[0]}: {val}')
    
    conn.close()

if __name__ == '__main__':
    run_migration()
