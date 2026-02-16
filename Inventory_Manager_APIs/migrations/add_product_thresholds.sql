-- Migration: Add per-product stock alert thresholds
-- Date: 2026-02-11
-- Description: Adds low_stock_threshold and shelf_restock_threshold columns to products table.
--              These allow per-product customization of alert thresholds.
--              Default values match the previously hardcoded constants (20 and 5).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS shelf_restock_threshold INTEGER NOT NULL DEFAULT 5;
