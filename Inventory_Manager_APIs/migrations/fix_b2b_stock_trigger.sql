-- ============================================================================
-- Migration: Fix B2B Stock Update Trigger
-- Purpose: Fix "column total_quantity does not exist" error by writing to inventory_batches
-- Date: 2026-02-09
-- ============================================================================

CREATE OR REPLACE FUNCTION update_stock_on_b2b_purchase()
RETURNS TRIGGER AS $$
DECLARE
    v_location_id INT;
    v_batch_code VARCHAR(50);
BEGIN
    -- 1. Find a default location (Warehouse preferred)
    -- Try to find a location with 'warehouse' in the name or type
    SELECT id INTO v_location_id FROM locations 
    WHERE location_type = 'warehouse' OR name ILIKE '%warehouse%' 
    ORDER BY id ASC LIMIT 1;
    
    -- If no warehouse, try 'store'
    IF v_location_id IS NULL THEN
        SELECT id INTO v_location_id FROM locations 
        WHERE location_type = 'store' OR name ILIKE '%store%' 
        ORDER BY id ASC LIMIT 1;
    END IF;
    
    -- If still null, just pick any valid location
    IF v_location_id IS NULL THEN
        SELECT id INTO v_location_id FROM locations ORDER BY id ASC LIMIT 1;
    END IF;
    
    -- If absolutely no location exists, we cannot add stock.
    IF v_location_id IS NULL THEN
        RAISE EXCEPTION 'No inventory location found to receive B2B purchase items. Please create a location first.';
    END IF;
    
    -- 2. Generate Batch Code
    -- Format: B2B-{purchase_id}-{product_id}-{random}
    v_batch_code := 'B2B-' || NEW.purchase_id || '-' || NEW.product_id || '-' || floor(random() * 1000)::text;
    
    -- 3. Insert into inventory_batches
    INSERT INTO inventory_batches (
        product_id, 
        location_id, 
        batch_code, 
        quantity, 
        unit_cost, 
        expiry_date, 
        received_at
    )
    VALUES (
        NEW.product_id,
        v_location_id,
        v_batch_code,
        NEW.quantity,
        NEW.unit_cost,
        (CURRENT_DATE + INTERVAL '1 year'), -- Default expiry 1 year
        NOW()
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
