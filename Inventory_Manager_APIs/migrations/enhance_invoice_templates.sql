-- Migration: Enhance business_settings for invoice templates
-- Run this migration to add template support

-- Add template and enhanced invoice settings
INSERT INTO business_settings (key, value) VALUES
    ('default_template', 'classic'),
    ('business_logo', ''),
    ('business_state', ''),
    ('business_state_code', ''),
    ('bank_name', ''),
    ('bank_account', ''),
    ('bank_ifsc', ''),
    ('bank_branch', ''),
    ('show_logo', 'true'),
    ('show_bank_details', 'true'),
    ('show_upi_qr', 'true'),
    ('show_signature', 'true'),
    ('signature_image', ''),
    ('signature_name', '')
ON CONFLICT (key) DO NOTHING;

-- Drop and recreate invoice_templates table to ensure correct schema
DROP TABLE IF EXISTS invoice_templates CASCADE;

CREATE TABLE invoice_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    template_type VARCHAR(50) DEFAULT 'system',
    primary_color VARCHAR(20) DEFAULT '#dc2626',
    secondary_color VARCHAR(20) DEFAULT '#1f2937',
    accent_color VARCHAR(20) DEFAULT '#f3f4f6',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default templates
INSERT INTO invoice_templates (name, description, template_type, primary_color, secondary_color) VALUES
    ('Classic Red', 'Professional red theme similar to Vyapaar', 'system', '#dc2626', '#1f2937'),
    ('Professional Blue', 'Corporate blue theme for formal invoices', 'system', '#2563eb', '#1e3a5f'),
    ('Minimal Clean', 'Simple modern design with minimal colors', 'system', '#374151', '#111827'),
    ('Elegant Green', 'Nature-inspired professional look', 'system', '#059669', '#064e3b');

-- Add template column to invoices if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='invoices' AND column_name='template') THEN
        ALTER TABLE invoices ADD COLUMN template VARCHAR(50) DEFAULT 'classic';
    END IF;
END $$;
