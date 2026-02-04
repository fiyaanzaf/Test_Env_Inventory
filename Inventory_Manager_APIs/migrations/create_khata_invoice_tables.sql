-- ============================================================================
-- KHATA (B2C Credit) & INVOICE SYSTEM
-- Created: 2026-02-03
-- Purpose: Track retail customer credit purchases and professional invoicing
-- ============================================================================

-- ============================================================================
-- 1. KHATA CUSTOMERS TABLE
-- Links to sales_orders via customer phone for credit tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS khata_customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255),
    address TEXT,
    
    -- Credit Settings
    credit_limit NUMERIC(12, 2) DEFAULT 5000.00,
    current_balance NUMERIC(12, 2) DEFAULT 0.00,  -- Positive = customer owes us
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_blocked BOOLEAN DEFAULT FALSE,  -- Auto-blocked when over limit
    block_reason VARCHAR(255),
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_khata_customers_phone ON khata_customers(phone);
CREATE INDEX idx_khata_customers_balance ON khata_customers(current_balance DESC);

-- ============================================================================
-- 2. KHATA TRANSACTIONS TABLE
-- Records all credit purchases and payments
-- ============================================================================
CREATE TABLE IF NOT EXISTS khata_transactions (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES khata_customers(id),
    
    -- Transaction Type
    type VARCHAR(20) NOT NULL CHECK (type IN ('CREDIT_SALE', 'PAYMENT', 'ADJUSTMENT')),
    
    -- Amount (positive for credit sale, negative for payment received)
    amount NUMERIC(12, 2) NOT NULL,
    running_balance NUMERIC(12, 2) NOT NULL,  -- Balance after this transaction
    
    -- Linked Records
    sales_order_id INTEGER REFERENCES sales_orders(id),  -- For CREDIT_SALE
    invoice_id INTEGER,  -- Will be linked to invoices table
    
    -- Payment Details (for PAYMENT type)
    payment_mode VARCHAR(50),  -- 'cash', 'upi', 'bank_transfer', 'cheque'
    payment_reference VARCHAR(255),
    
    -- UPI Payment Tracking
    upi_transaction_id VARCHAR(100),
    upi_payment_status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'completed', 'failed'
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    created_by_name VARCHAR(255)
);

CREATE INDEX idx_khata_transactions_customer ON khata_transactions(customer_id);
CREATE INDEX idx_khata_transactions_date ON khata_transactions(created_at DESC);
CREATE INDEX idx_khata_transactions_sales ON khata_transactions(sales_order_id);

-- ============================================================================
-- 3. INVOICES TABLE
-- Professional invoice management for both B2C and B2B
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    
    -- Invoice Number (auto-generated: INV-YYYY-NNNNNN)
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    
    -- Invoice Type
    invoice_type VARCHAR(20) NOT NULL CHECK (invoice_type IN ('RETAIL', 'B2B', 'CREDIT')),
    
    -- Customer Details (denormalized for invoice permanence)
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20),
    customer_email VARCHAR(255),
    customer_address TEXT,
    customer_gstin VARCHAR(15),
    
    -- Linked Records
    khata_customer_id INTEGER REFERENCES khata_customers(id),
    b2b_client_id INTEGER REFERENCES b2b_clients(id),
    sales_order_id INTEGER REFERENCES sales_orders(id),
    b2b_order_id INTEGER REFERENCES b2b_orders(id),
    
    -- Amounts
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12, 2) DEFAULT 0,
    tax_amount NUMERIC(12, 2) DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    amount_paid NUMERIC(12, 2) DEFAULT 0,
    balance_due NUMERIC(12, 2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
    
    -- Tax Details (GST)
    cgst_rate NUMERIC(5, 2) DEFAULT 0,
    sgst_rate NUMERIC(5, 2) DEFAULT 0,
    igst_rate NUMERIC(5, 2) DEFAULT 0,
    cgst_amount NUMERIC(12, 2) DEFAULT 0,
    sgst_amount NUMERIC(12, 2) DEFAULT 0,
    igst_amount NUMERIC(12, 2) DEFAULT 0,
    
    -- Payment
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'overdue')),
    payment_terms VARCHAR(100),  -- e.g., "Net 30", "Due on Receipt"
    
    -- UPI Payment Link
    upi_payment_link TEXT,
    upi_qr_data TEXT,  -- UPI intent string for QR code
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'cancelled')),
    
    -- Email Tracking
    email_sent_at TIMESTAMP,
    email_opened_at TIMESTAMP,
    
    -- Metadata
    notes TEXT,
    terms_and_conditions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_date ON invoices(invoice_date DESC);
CREATE INDEX idx_invoices_customer ON invoices(customer_phone);
CREATE INDEX idx_invoices_status ON invoices(payment_status);
CREATE INDEX idx_invoices_khata ON invoices(khata_customer_id);
CREATE INDEX idx_invoices_b2b ON invoices(b2b_client_id);

-- ============================================================================
-- 4. INVOICE ITEMS TABLE
-- Line items for each invoice
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    
    -- Product Details (denormalized for invoice permanence)
    product_id INTEGER REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100),
    hsn_code VARCHAR(20),  -- HSN/SAC code for GST
    
    -- Quantities & Pricing
    quantity NUMERIC(10, 3) NOT NULL,
    unit_of_measure VARCHAR(50) DEFAULT 'pcs',
    unit_price NUMERIC(12, 2) NOT NULL,
    discount_percent NUMERIC(5, 2) DEFAULT 0,
    discount_amount NUMERIC(12, 2) DEFAULT 0,
    
    -- Tax
    tax_rate NUMERIC(5, 2) DEFAULT 0,
    tax_amount NUMERIC(12, 2) DEFAULT 0,
    
    -- Line Total
    line_total NUMERIC(12, 2) NOT NULL,
    
    -- Ordering
    sort_order INTEGER DEFAULT 0
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

-- ============================================================================
-- 5. BUSINESS SETTINGS TABLE
-- Store business details for invoices
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value TEXT,
    category VARCHAR(50) DEFAULT 'general',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id)
);

-- Insert default business settings
INSERT INTO business_settings (key, value, category) VALUES
    ('business_name', 'My Store', 'business'),
    ('business_address', '', 'business'),
    ('business_phone', '', 'business'),
    ('business_email', '', 'business'),
    ('business_gstin', '', 'business'),
    ('business_pan', '', 'business'),
    ('business_logo_url', '', 'business'),
    
    -- UPI Settings
    ('upi_id', '', 'payment'),
    ('upi_merchant_name', '', 'payment'),
    ('upi_merchant_code', '', 'payment'),
    
    -- Invoice Settings
    ('invoice_prefix', 'INV', 'invoice'),
    ('invoice_terms', 'Thank you for your business!', 'invoice'),
    ('invoice_footer', '', 'invoice'),
    
    -- Khata Settings
    ('default_credit_limit', '5000', 'khata'),
    ('credit_limit_warning_percent', '80', 'khata'),
    ('auto_block_on_limit', 'true', 'khata'),
    ('khata_reminder_days', '7,15,30', 'khata')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 6. INVOICE SEQUENCE TABLE
-- For generating invoice numbers
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoice_sequences (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    prefix VARCHAR(20) NOT NULL DEFAULT 'INV',
    last_number INTEGER NOT NULL DEFAULT 0,
    UNIQUE(year, prefix)
);

-- Initialize current year sequence
INSERT INTO invoice_sequences (year, prefix, last_number)
VALUES (EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 'INV', 0)
ON CONFLICT (year, prefix) DO NOTHING;

-- ============================================================================
-- 7. KHATA REMINDERS TABLE
-- Track sent reminders
-- ============================================================================
CREATE TABLE IF NOT EXISTS khata_reminders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES khata_customers(id),
    
    -- Reminder Details
    reminder_type VARCHAR(20) NOT NULL CHECK (reminder_type IN ('whatsapp', 'sms', 'email')),
    message_content TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    error_message TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_khata_reminders_customer ON khata_reminders(customer_id);

-- ============================================================================
-- 8. TRIGGERS
-- ============================================================================

-- Trigger: Update khata_customers.current_balance on transaction
CREATE OR REPLACE FUNCTION update_khata_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE khata_customers 
        SET current_balance = NEW.running_balance,
            updated_at = CURRENT_TIMESTAMP,
            -- Auto-block if over limit
            is_blocked = CASE 
                WHEN NEW.running_balance > credit_limit THEN TRUE 
                ELSE is_blocked 
            END,
            block_reason = CASE 
                WHEN NEW.running_balance > credit_limit THEN 'Credit limit exceeded'
                ELSE block_reason
            END
        WHERE id = NEW.customer_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_khata_balance ON khata_transactions;
CREATE TRIGGER trg_update_khata_balance
    AFTER INSERT ON khata_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_khata_balance();

-- Trigger: Auto-generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
    current_year INTEGER;
    next_num INTEGER;
    prefix_val VARCHAR(20);
BEGIN
    IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
        current_year := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
        
        -- Get or create sequence for this year
        INSERT INTO invoice_sequences (year, prefix, last_number)
        VALUES (current_year, 'INV', 0)
        ON CONFLICT (year, prefix) DO NOTHING;
        
        -- Get next number
        UPDATE invoice_sequences 
        SET last_number = last_number + 1 
        WHERE year = current_year AND prefix = 'INV'
        RETURNING last_number, prefix INTO next_num, prefix_val;
        
        -- Format: INV-2026-000001
        NEW.invoice_number := prefix_val || '-' || current_year || '-' || LPAD(next_num::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_invoice_number ON invoices;
CREATE TRIGGER trg_generate_invoice_number
    BEFORE INSERT ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION generate_invoice_number();

-- Trigger: Update invoice updated_at
CREATE OR REPLACE FUNCTION update_invoice_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_invoice_timestamp ON invoices;
CREATE TRIGGER trg_update_invoice_timestamp
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_invoice_timestamp();

-- ============================================================================
-- 9. VIEWS
-- ============================================================================

-- View: Khata customers with status
CREATE OR REPLACE VIEW v_khata_dashboard AS
SELECT 
    kc.id,
    kc.name,
    kc.phone,
    kc.email,
    kc.credit_limit,
    kc.current_balance,
    kc.is_active,
    kc.is_blocked,
    CASE 
        WHEN kc.current_balance <= 0 THEN 'clear'
        WHEN kc.current_balance < kc.credit_limit * 0.8 THEN 'normal'
        WHEN kc.current_balance < kc.credit_limit THEN 'warning'
        ELSE 'over_limit'
    END as balance_status,
    ROUND((kc.current_balance / NULLIF(kc.credit_limit, 0)) * 100, 1) as limit_used_percent,
    (SELECT COUNT(*) FROM khata_transactions kt WHERE kt.customer_id = kc.id AND kt.type = 'CREDIT_SALE') as total_purchases,
    (SELECT MAX(created_at) FROM khata_transactions kt WHERE kt.customer_id = kc.id) as last_transaction_date
FROM khata_customers kc
WHERE kc.is_active = TRUE;

-- View: Pending khata amounts by age
CREATE OR REPLACE VIEW v_khata_aging AS
SELECT 
    kc.id as customer_id,
    kc.name,
    kc.phone,
    kc.current_balance,
    (SELECT MAX(created_at) FROM khata_transactions kt 
     WHERE kt.customer_id = kc.id AND kt.type = 'CREDIT_SALE') as oldest_unpaid_date,
    EXTRACT(DAY FROM CURRENT_TIMESTAMP - 
        (SELECT MIN(created_at) FROM khata_transactions kt 
         WHERE kt.customer_id = kc.id AND kt.type = 'CREDIT_SALE' 
         AND kt.running_balance > 0)) as days_outstanding
FROM khata_customers kc
WHERE kc.current_balance > 0 AND kc.is_active = TRUE;

-- View: Invoice summary
CREATE OR REPLACE VIEW v_invoice_summary AS
SELECT 
    DATE_TRUNC('month', invoice_date) as month,
    invoice_type,
    COUNT(*) as invoice_count,
    SUM(total_amount) as total_amount,
    SUM(amount_paid) as amount_collected,
    SUM(balance_due) as pending_amount
FROM invoices
WHERE status != 'cancelled'
GROUP BY DATE_TRUNC('month', invoice_date), invoice_type
ORDER BY month DESC;

-- ============================================================================
-- 10. GRANT PERMISSIONS (if using specific roles)
-- ============================================================================
-- GRANT SELECT, INSERT, UPDATE ON khata_customers TO app_user;
-- GRANT SELECT, INSERT ON khata_transactions TO app_user;
-- GRANT SELECT, INSERT, UPDATE ON invoices TO app_user;
-- GRANT SELECT, INSERT ON invoice_items TO app_user;

COMMENT ON TABLE khata_customers IS 'B2C credit customers - tracks customers who buy on credit (khata)';
COMMENT ON TABLE khata_transactions IS 'Credit purchases and payments for khata customers';
COMMENT ON TABLE invoices IS 'Professional invoices for retail, credit, and B2B sales';
COMMENT ON TABLE invoice_items IS 'Line items for invoices';
COMMENT ON TABLE business_settings IS 'Store business details and settings';
