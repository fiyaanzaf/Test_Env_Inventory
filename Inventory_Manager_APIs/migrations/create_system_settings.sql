-- Migration: Create system_settings table for SMTP and other app settings
-- Run this migration to enable email sending functionality

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default SMTP settings (user needs to update these with real values)
INSERT INTO system_settings (key, value, description) VALUES
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
ON CONFLICT (key) DO NOTHING;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);
