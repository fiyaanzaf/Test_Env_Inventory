-- Migration: Add best_before_days column to products table
-- Date: 2026-03-23
-- Purpose: Allows each product to have a default shelf-life duration (in days).
--          Used by GRN confirm to auto-calculate expiry_date from manufacturing_date.
--          Example: A pickle jar with best_before_days = 180 means 6 months shelf life.

-- Add best_before_days to products (safe: uses IF NOT EXISTS pattern)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'best_before_days'
    ) THEN
        ALTER TABLE products ADD COLUMN best_before_days INTEGER DEFAULT NULL;
        RAISE NOTICE 'Column best_before_days added to products table.';
    ELSE
        RAISE NOTICE 'Column best_before_days already exists, skipping.';
    END IF;
END
$$;
