-- Add composite indexes for better query performance
-- Date: 2025-11-27

-- Withdrawals composite indexes
CREATE INDEX IF NOT EXISTS idx_withdrawals_status_created_at ON withdrawals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_status ON withdrawals(user_id, status);

-- Deposits composite indexes
CREATE INDEX IF NOT EXISTS idx_deposits_status_created_at ON deposits(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_user_status ON deposits(user_id, status);

-- Reviewed/Verified by indexes for faster admin lookups
CREATE INDEX IF NOT EXISTS idx_withdrawals_reviewed_by ON withdrawals(reviewed_by) WHERE reviewed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deposits_verified_by ON deposits(verified_by) WHERE verified_by IS NOT NULL;
