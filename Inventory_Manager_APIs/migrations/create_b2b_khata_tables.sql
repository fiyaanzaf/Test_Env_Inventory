-- ============================================================================
-- Migration: B2B & Khata Management Module
-- Purpose: Create tables for wholesale client management, ledger tracking,
--          B2B orders, and smart pricing history
-- Date: 2026-02-02
-- ============================================================================

-- ============================================================================
-- 1. B2B CLIENTS TABLE
-- Stores business client information with credit management
-- ============================================================================
CREATE TABLE IF NOT EXISTS b2b_clients (
    id SERIAL PRIMARY KEY,
    
    -- Business Information
    name VARCHAR(255) NOT NULL,                    -- Business name: "Sharma Tea Stall"
    contact_person VARCHAR(255),                   -- Contact: "Raju"
    phone VARCHAR(20) NOT NULL,                    -- Primary contact (for WhatsApp)
    email VARCHAR(255),
    gstin VARCHAR(15),                             -- Optional GST number (15 chars)
    address TEXT,
    
    -- Credit & Pricing Configuration
    credit_limit DECIMAL(12,2) DEFAULT 10000.00,   -- Max debt allowed
    current_balance DECIMAL(12,2) DEFAULT 0.00,    -- Cached balance (Positive = they owe us)
    price_tier VARCHAR(20) DEFAULT 'standard',     -- 'gold', 'silver', 'standard'
    
    -- Status & Metadata
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INT REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT unique_b2b_phone UNIQUE (phone),
    CONSTRAINT valid_price_tier CHECK (price_tier IN ('gold', 'silver', 'standard'))
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_b2b_clients_phone ON b2b_clients(phone);
CREATE INDEX IF NOT EXISTS idx_b2b_clients_active ON b2b_clients(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_b2b_clients_balance ON b2b_clients(current_balance DESC);

COMMENT ON TABLE b2b_clients IS 'Stores wholesale/B2B business clients for Khata management';
COMMENT ON COLUMN b2b_clients.current_balance IS 'Cached running balance. Positive = client owes money. Updated on every transaction.';
COMMENT ON COLUMN b2b_clients.price_tier IS 'Used for automatic pricing: gold (best), silver, standard';


-- ============================================================================
-- 2. B2B ORDERS TABLE
-- Stores wholesale orders linked to clients
-- ============================================================================
CREATE TABLE IF NOT EXISTS b2b_orders (
    id SERIAL PRIMARY KEY,
    client_id INT NOT NULL REFERENCES b2b_clients(id) ON DELETE RESTRICT,
    
    -- Order Details
    order_date TIMESTAMP DEFAULT NOW(),
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_cost DECIMAL(12,2) DEFAULT 0.00,         -- For profit calculation
    
    -- Status Management
    status VARCHAR(20) DEFAULT 'pending',          -- 'pending', 'completed', 'cancelled', 'partial'
    payment_status VARCHAR(20) DEFAULT 'unpaid',   -- 'unpaid', 'partial', 'paid'
    amount_paid DECIMAL(12,2) DEFAULT 0.00,        -- Track partial payments against this order
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INT REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT valid_order_status CHECK (status IN ('pending', 'completed', 'cancelled', 'partial')),
    CONSTRAINT valid_payment_status CHECK (payment_status IN ('unpaid', 'partial', 'paid'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_b2b_orders_client ON b2b_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_b2b_orders_date ON b2b_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_orders_status ON b2b_orders(status);
CREATE INDEX IF NOT EXISTS idx_b2b_orders_payment ON b2b_orders(payment_status) WHERE payment_status != 'paid';

COMMENT ON TABLE b2b_orders IS 'Wholesale orders for B2B clients. Links to b2b_order_items for line items.';


-- ============================================================================
-- 3. B2B ORDER ITEMS TABLE
-- Line items for each B2B order
-- ============================================================================
CREATE TABLE IF NOT EXISTS b2b_order_items (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES b2b_orders(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    
    -- Quantity & Pricing
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,             -- Custom price for this client/order
    unit_cost DECIMAL(10,2),                       -- Cost at time of sale (for margin)
    line_total DECIMAL(12,2) NOT NULL,             -- quantity * unit_price
    
    -- Backorder tracking
    is_backorder BOOLEAN DEFAULT FALSE,            -- If quantity > stock, this is a backorder
    backorder_quantity INT DEFAULT 0,              -- How much is on backorder
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast order lookups
CREATE INDEX IF NOT EXISTS idx_b2b_order_items_order ON b2b_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_b2b_order_items_product ON b2b_order_items(product_id);

COMMENT ON TABLE b2b_order_items IS 'Line items for B2B orders with custom pricing per client';


-- ============================================================================
-- 4. B2B TRANSACTIONS TABLE (THE KHATA/LEDGER)
-- Every credit (payment received) and debit (goods sold) is recorded here
-- This is the core of the "Khata" functionality
-- ============================================================================
CREATE TABLE IF NOT EXISTS b2b_transactions (
    id SERIAL PRIMARY KEY,
    client_id INT NOT NULL REFERENCES b2b_clients(id) ON DELETE RESTRICT,
    
    -- Transaction Type
    type VARCHAR(20) NOT NULL,                     -- 'SALE' (debit - they owe more) or 'PAYMENT' (credit - they paid)
    
    -- Amount & Balance
    amount DECIMAL(12,2) NOT NULL,                 -- Always positive. Type determines direction.
    running_balance DECIMAL(12,2) NOT NULL,        -- Balance AFTER this transaction
    
    -- Linking
    related_order_id INT REFERENCES b2b_orders(id) ON DELETE SET NULL,  -- For SALE type
    
    -- Payment Details (for PAYMENT type)
    payment_mode VARCHAR(20),                      -- 'cash', 'upi', 'cheque', 'bank_transfer'
    payment_reference VARCHAR(100),                -- Cheque #, UPI ref, transaction ID
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by INT REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT valid_txn_type CHECK (type IN ('SALE', 'PAYMENT')),
    CONSTRAINT valid_payment_mode CHECK (
        payment_mode IS NULL OR 
        payment_mode IN ('cash', 'upi', 'cheque', 'bank_transfer', 'other')
    )
);

-- Indexes for fast ledger queries
CREATE INDEX IF NOT EXISTS idx_b2b_txn_client ON b2b_transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_b2b_txn_date ON b2b_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_txn_type ON b2b_transactions(type);
CREATE INDEX IF NOT EXISTS idx_b2b_txn_order ON b2b_transactions(related_order_id) WHERE related_order_id IS NOT NULL;

COMMENT ON TABLE b2b_transactions IS 'Ledger/Khata for B2B clients. Each row is a transaction with running balance.';
COMMENT ON COLUMN b2b_transactions.type IS 'SALE = client owes more (debit), PAYMENT = client paid (credit)';
COMMENT ON COLUMN b2b_transactions.running_balance IS 'Balance after this transaction. Positive = client owes money.';


-- ============================================================================
-- 5. CLIENT ITEM HISTORY TABLE (SMART PRICING ENGINE)
-- Tracks the last price charged to each client for each product
-- Used for "auto-fill last price" feature
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_item_history (
    id SERIAL PRIMARY KEY,
    client_id INT NOT NULL REFERENCES b2b_clients(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- Pricing History
    last_sold_price DECIMAL(10,2) NOT NULL,
    last_sold_quantity INT,
    last_sold_date TIMESTAMP DEFAULT NOW(),
    
    -- Statistics (for frequent items feature)
    total_quantity_sold INT DEFAULT 0,             -- Cumulative quantity sold to this client
    order_count INT DEFAULT 1,                     -- How many times this item was ordered
    
    -- Unique constraint: one record per client-product pair
    CONSTRAINT unique_client_product UNIQUE (client_id, product_id)
);

-- Composite index for fast price lookups
CREATE INDEX IF NOT EXISTS idx_client_item_lookup ON client_item_history(client_id, product_id);
CREATE INDEX IF NOT EXISTS idx_client_item_frequent ON client_item_history(client_id, order_count DESC);

COMMENT ON TABLE client_item_history IS 'Tracks last price and purchase frequency per client-product pair for smart pricing';


-- ============================================================================
-- 6. B2B SETTINGS TABLE
-- Global settings for B2B module (similar to loyalty_settings)
-- ============================================================================
CREATE TABLE IF NOT EXISTS b2b_settings (
    key VARCHAR(50) PRIMARY KEY,
    value VARCHAR(255) NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default settings
INSERT INTO b2b_settings (key, value, description) VALUES
    ('default_credit_limit', '10000', 'Default credit limit for new B2B clients'),
    ('credit_warning_threshold', '0.8', 'Warn when client reaches 80% of credit limit'),
    ('gold_tier_discount', '0.05', 'Default discount percentage for gold tier clients'),
    ('silver_tier_discount', '0.03', 'Default discount percentage for silver tier clients'),
    ('auto_reminder_days', '7', 'Days after which to auto-send payment reminder'),
    ('statement_days_default', '30', 'Default days to include in statement PDF')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE b2b_settings IS 'Configuration settings for B2B/Khata module';


-- ============================================================================
-- 7. HELPER FUNCTION: Update Client Balance
-- Automatically updates the cached current_balance on b2b_clients
-- ============================================================================
CREATE OR REPLACE FUNCTION update_client_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Recalculate and update the client's cached balance
    -- SALE increases balance (they owe more)
    -- PAYMENT decreases balance (they paid)
    IF TG_OP = 'INSERT' THEN
        IF NEW.type = 'SALE' THEN
            UPDATE b2b_clients 
            SET current_balance = current_balance + NEW.amount,
                updated_at = NOW()
            WHERE id = NEW.client_id;
        ELSIF NEW.type = 'PAYMENT' THEN
            UPDATE b2b_clients 
            SET current_balance = current_balance - NEW.amount,
                updated_at = NOW()
            WHERE id = NEW.client_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists to allow re-running migration)
DROP TRIGGER IF EXISTS trg_update_client_balance ON b2b_transactions;
CREATE TRIGGER trg_update_client_balance
    AFTER INSERT ON b2b_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_client_balance();

COMMENT ON FUNCTION update_client_balance() IS 'Trigger function to auto-update client balance cache on new transactions';


-- ============================================================================
-- 8. HELPER FUNCTION: Update Item History
-- Updates client_item_history when a B2B order item is created
-- ============================================================================
CREATE OR REPLACE FUNCTION update_client_item_history()
RETURNS TRIGGER AS $$
DECLARE
    v_client_id INT;
BEGIN
    -- Get client_id from the parent order
    SELECT client_id INTO v_client_id 
    FROM b2b_orders 
    WHERE id = NEW.order_id;
    
    -- Upsert into client_item_history
    INSERT INTO client_item_history (
        client_id, 
        product_id, 
        last_sold_price, 
        last_sold_quantity,
        last_sold_date,
        total_quantity_sold,
        order_count
    ) VALUES (
        v_client_id,
        NEW.product_id,
        NEW.unit_price,
        NEW.quantity,
        NOW(),
        NEW.quantity,
        1
    )
    ON CONFLICT (client_id, product_id) 
    DO UPDATE SET
        last_sold_price = EXCLUDED.last_sold_price,
        last_sold_quantity = EXCLUDED.last_sold_quantity,
        last_sold_date = NOW(),
        total_quantity_sold = client_item_history.total_quantity_sold + EXCLUDED.total_quantity_sold,
        order_count = client_item_history.order_count + 1;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_update_item_history ON b2b_order_items;
CREATE TRIGGER trg_update_item_history
    AFTER INSERT ON b2b_order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_client_item_history();

COMMENT ON FUNCTION update_client_item_history() IS 'Trigger function to auto-update pricing history when B2B items are sold';


-- ============================================================================
-- 9. VIEW: B2B Dashboard Summary
-- Provides quick stats for the B2B dashboard
-- ============================================================================
CREATE OR REPLACE VIEW v_b2b_dashboard AS
SELECT 
    -- Total to collect (sum of all positive balances)
    COALESCE(SUM(CASE WHEN current_balance > 0 THEN current_balance ELSE 0 END), 0) AS total_to_collect,
    
    -- Count of clients over credit limit
    COUNT(CASE WHEN current_balance > credit_limit THEN 1 END) AS clients_over_limit,
    
    -- Total active clients
    COUNT(CASE WHEN is_active THEN 1 END) AS active_clients,
    
    -- Total outstanding (including negative balances/overpayments)
    COALESCE(SUM(current_balance), 0) AS net_outstanding
FROM b2b_clients
WHERE is_active = TRUE;

COMMENT ON VIEW v_b2b_dashboard IS 'Aggregate view for B2B dashboard quick stats';


-- ============================================================================
-- 10. VIEW: Top Debtors
-- Lists top clients by outstanding balance
-- ============================================================================
CREATE OR REPLACE VIEW v_top_debtors AS
SELECT 
    id,
    name,
    contact_person,
    phone,
    current_balance,
    credit_limit,
    CASE 
        WHEN current_balance > credit_limit THEN 'over_limit'
        WHEN current_balance > credit_limit * 0.8 THEN 'warning'
        WHEN current_balance > 0 THEN 'normal'
        ELSE 'clear'
    END AS balance_status,
    price_tier
FROM b2b_clients
WHERE is_active = TRUE AND current_balance > 0
ORDER BY current_balance DESC
LIMIT 10;

COMMENT ON VIEW v_top_debtors IS 'Top 10 clients by outstanding balance for dashboard widget';


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Run this migration with: psql -U your_user -d your_db -f create_b2b_khata_tables.sql
-- 
-- Tables Created:
--   1. b2b_clients        - Business client information
--   2. b2b_orders         - Wholesale orders
--   3. b2b_order_items    - Order line items
--   4. b2b_transactions   - Ledger/Khata entries
--   5. client_item_history - Smart pricing history
--   6. b2b_settings       - Module configuration
--
-- Triggers:
--   - trg_update_client_balance: Auto-updates client balance on transactions
--   - trg_update_item_history: Auto-updates pricing history on order items
--
-- Views:
--   - v_b2b_dashboard: Quick stats for dashboard
--   - v_top_debtors: Top 10 clients by balance
-- ============================================================================
