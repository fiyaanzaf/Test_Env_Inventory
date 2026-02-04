-- Migration: Create invoice_settings table for invoice customization
-- Run this migration to enable invoice generation with templates

-- Add invoice-related settings to system_settings
INSERT INTO system_settings (key, value, description) VALUES
    ('business_logo', '', 'Base64 encoded business logo for invoices'),
    ('business_gstin', '', 'Business GSTIN number'),
    ('business_state', '', 'Business state (for GST calculation)'),
    ('business_state_code', '', 'State code for GST (e.g., 27 for Maharashtra)'),
    ('bank_name', '', 'Bank name for invoice payment details'),
    ('bank_account', '', 'Bank account number'),
    ('bank_ifsc', '', 'Bank IFSC code'),
    ('bank_branch', '', 'Bank branch name'),
    ('invoice_prefix', 'INV', 'Invoice number prefix'),
    ('invoice_terms', 'Thank you for your business!', 'Default terms and conditions'),
    ('invoice_footer', '', 'Custom footer text for invoices'),
    ('default_template', 'classic', 'Default invoice template (classic, professional, minimal, thermal)'),
    ('show_logo', 'true', 'Show logo on invoices'),
    ('show_bank_details', 'true', 'Show bank details on invoices'),
    ('show_upi_qr', 'true', 'Show UPI QR code on invoices'),
    ('show_signature', 'true', 'Show authorized signature section'),
    ('signature_image', '', 'Base64 encoded signature image'),
    ('signature_name', '', 'Name under signature')
ON CONFLICT (key) DO NOTHING;

-- Create invoice_templates table for custom templates (future use)
CREATE TABLE IF NOT EXISTS invoice_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    template_type VARCHAR(50) DEFAULT 'custom', -- 'system' or 'custom'
    primary_color VARCHAR(20) DEFAULT '#dc2626',
    secondary_color VARCHAR(20) DEFAULT '#1f2937',
    accent_color VARCHAR(20) DEFAULT '#f3f4f6',
    font_family VARCHAR(100) DEFAULT 'Arial, sans-serif',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default templates
INSERT INTO invoice_templates (name, description, template_type, primary_color, secondary_color) VALUES
    ('Classic Red', 'Professional red theme like Vyapaar', 'system', '#dc2626', '#1f2937'),
    ('Professional Blue', 'Corporate blue theme', 'system', '#2563eb', '#1e3a5f'),
    ('Minimal Clean', 'Simple modern design with minimal colors', 'system', '#374151', '#111827'),
    ('Elegant Green', 'Nature-inspired professional look', 'system', '#059669', '#064e3b')
ON CONFLICT DO NOTHING;

-- Create invoice_counter table for auto-incrementing invoice numbers
CREATE TABLE IF NOT EXISTS invoice_counter (
    id SERIAL PRIMARY KEY,
    year INT NOT NULL,
    counter INT DEFAULT 0,
    UNIQUE(year)
);

-- Initialize counter for current year
INSERT INTO invoice_counter (year, counter) 
VALUES (EXTRACT(YEAR FROM CURRENT_DATE)::INT, 0)
ON CONFLICT (year) DO NOTHING;
