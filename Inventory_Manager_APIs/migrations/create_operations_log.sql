-- Migration: Create operations_log table
-- Purpose: Separate write-offs and backups from audit_logs for faster queries

-- 1. Create new table
CREATE TABLE IF NOT EXISTS operations_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    username VARCHAR(100),
    operation_type VARCHAR(50) NOT NULL,  -- 'write_off' or 'backup'
    sub_type VARCHAR(50),                  -- For backups: 'create', 'restore', 'restore_fail'
    target_id INT,                         -- batch_id for write-offs
    quantity INT,                          -- For write-offs: quantity removed
    reason VARCHAR(255),                   -- For write-offs: reason
    file_name VARCHAR(255),                -- For backups: filename
    details JSONB,                         -- Additional JSON data
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_ops_log_type ON operations_log(operation_type);
CREATE INDEX IF NOT EXISTS idx_ops_log_created ON operations_log(created_at);
CREATE INDEX IF NOT EXISTS idx_ops_log_user ON operations_log(user_id);

-- 3. Migrate existing write-off records
INSERT INTO operations_log (
    user_id, username, operation_type, target_id, 
    quantity, reason, details, ip_address, created_at
)
SELECT 
    user_id, 
    username, 
    'write_off', 
    target_id,
    (details->>'removed')::int,
    details->>'reason',
    details,
    ip_address,
    timestamp
FROM audit_logs
WHERE action = 'WRITE_OFF_STOCK'
ON CONFLICT DO NOTHING;

-- 4. Migrate existing backup records
INSERT INTO operations_log (
    user_id, username, operation_type, sub_type,
    file_name, details, ip_address, created_at
)
SELECT 
    user_id, 
    username, 
    'backup',
    CASE 
        WHEN action = 'DB_RESTORE' THEN 'restore'
        WHEN action = 'DB_RESTORE_FAIL' THEN 'restore_fail'
    END,
    details->>'filename',
    details,
    ip_address,
    timestamp
FROM audit_logs
WHERE action IN ('DB_RESTORE', 'DB_RESTORE_FAIL')
ON CONFLICT DO NOTHING;

-- Note: We keep the original records in audit_logs for now
-- Run this later if you want to remove them:
-- DELETE FROM audit_logs WHERE action IN ('WRITE_OFF_STOCK', 'DB_RESTORE', 'DB_RESTORE_FAIL');
