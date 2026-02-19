-- Add barcode column to products table
-- This column stores physical barcode (EAN-13, UPC-A etc.) distinct from SKU
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(255) DEFAULT NULL;

-- Create index for fast barcode lookups (used by wireless scanner)
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
