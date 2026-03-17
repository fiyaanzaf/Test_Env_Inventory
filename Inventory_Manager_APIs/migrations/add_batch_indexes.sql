-- Batch Tracking Performance Indexes
-- Run these against your PostgreSQL database to speed up batch queries

-- Index on batch_tracking.product_id — used by tree grouping and product breakdown
CREATE INDEX IF NOT EXISTS idx_batch_tracking_product_id ON batch_tracking(product_id);

-- Index on inventory_batches.tracking_batch_id — used by stock quantity JOIN
CREATE INDEX IF NOT EXISTS idx_inventory_batches_tracking_batch_id ON inventory_batches(tracking_batch_id);

-- Index on batch_tracking.batch_tag — used by tag-based filtering
CREATE INDEX IF NOT EXISTS idx_batch_tracking_batch_tag ON batch_tracking(batch_tag);

-- Index on batch_tracking.expiry_date — used by clearance/expiry queries
CREATE INDEX IF NOT EXISTS idx_batch_tracking_expiry_date ON batch_tracking(expiry_date);

-- Index on inventory_batches.product_id — used by product stock lookups
CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_id ON inventory_batches(product_id);
