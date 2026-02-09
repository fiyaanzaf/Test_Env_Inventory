-- ============================================================================
-- Migration: B2B Reverse Flow (Purchases & Outgoing Payments)
-- Purpose: Enable purchasing from B2B clients and paying them (Reverse Flow)
-- Date: 2026-02-09
-- ============================================================================

-- 1. Update Transaction Types Constraint
ALTER TABLE b2b_transactions DROP CONSTRAINT valid_txn_type;
ALTER TABLE b2b_transactions ADD CONSTRAINT valid_txn_type 
    CHECK (type IN ('SALE', 'PAYMENT', 'PURCHASE', 'PAYMENT_OUT'));

COMMENT ON COLUMN b2b_transactions.type IS 
'SALE (Debit/Receivable), PAYMENT (Credit/Received), PURCHASE (Credit/Payable), PAYMENT_OUT (Debit/Paid)';

-- 2. Create B2B Purchases Table (Similar to b2b_orders but for incoming items)
CREATE TABLE IF NOT EXISTS b2b_purchases (
    id SERIAL PRIMARY KEY,
    client_id INT NOT NULL REFERENCES b2b_clients(id) ON DELETE RESTRICT,
    
    -- Purchase Details
    purchase_date TIMESTAMP DEFAULT NOW(),
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    
    -- Status
    status VARCHAR(20) DEFAULT 'received',         -- 'received' (stock added), 'cancelled'
    payment_status VARCHAR(20) DEFAULT 'unpaid',   -- 'unpaid', 'partial', 'paid'
    amount_paid DECIMAL(12,2) DEFAULT 0.00,        -- Track payments made against this purchase
    
    -- Metadata
    reference_number VARCHAR(100),                 -- Client's Invoice Number
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INT REFERENCES users(id),
    
    CONSTRAINT valid_purchase_status CHECK (status IN ('received', 'cancelled')),
    CONSTRAINT valid_purchase_payment_status CHECK (payment_status IN ('unpaid', 'partial', 'paid'))
);

CREATE INDEX IF NOT EXISTS idx_b2b_purchases_client ON b2b_purchases(client_id);
CREATE INDEX IF NOT EXISTS idx_b2b_purchases_date ON b2b_purchases(purchase_date DESC);

-- 3. Create B2B Purchase Items Table
CREATE TABLE IF NOT EXISTS b2b_purchase_items (
    id SERIAL PRIMARY KEY,
    purchase_id INT NOT NULL REFERENCES b2b_purchases(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    
    -- Quantity & Cost
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_cost DECIMAL(10,2) NOT NULL,              -- Cost price
    line_total DECIMAL(12,2) NOT NULL,             -- quantity * unit_cost
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2b_purchase_items_purchase ON b2b_purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_b2b_purchase_items_product ON b2b_purchase_items(product_id);

-- 4. Update Client Balance Trigger Function
CREATE OR REPLACE FUNCTION update_client_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Recalculate and update the client's cached balance
    -- SALE (Debit): Increases balance (They owe us)
    -- PAYMENT (Credit): Decreases balance (They paid us)
    -- PURCHASE (Credit): Decreases balance (We owe them / Reduces their debt)
    -- PAYMENT_OUT (Debit): Increases balance (We paid them / Increases their debt/stat)
    
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
            
        ELSIF NEW.type = 'PURCHASE' THEN
            UPDATE b2b_clients 
            SET current_balance = current_balance - NEW.amount,
                updated_at = NOW()
            WHERE id = NEW.client_id;
            
        ELSIF NEW.type = 'PAYMENT_OUT' THEN
            UPDATE b2b_clients 
            SET current_balance = current_balance + NEW.amount,
                updated_at = NOW()
            WHERE id = NEW.client_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger to link Purchases to B2B Transactions (Ledger)
-- Note: We handle this in the application logic for flexibility (creating the txn explicitly),
-- but we could do it via trigger. For consistency with Sales logic, we'll keep it manual in API.
-- However, we DO need a trigger to auto-update stock when a B2B Purchase is created.

CREATE OR REPLACE FUNCTION update_stock_on_b2b_purchase()
RETURNS TRIGGER AS $$
BEGIN
    -- Increase stock for the product
    UPDATE products 
    SET total_quantity = total_quantity + NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.product_id;
    
    -- Also log this in stock_history if that table exists (optional based on your schema)
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_b2b_purchase_stock_update
    AFTER INSERT ON b2b_purchase_items
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_on_b2b_purchase();

