-- Migration: Create Withdrawals and Deposits tables
-- Date: 2025-11-27

-- Create withdrawals table
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  amount DECIMAL(18, 2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(50) NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('bank_transfer', 'credit_card', 'digital_wallet')),
  bank_details JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'processing', 'completed')),
  reviewed_by UUID REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create deposits table
CREATE TABLE IF NOT EXISTS deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  amount DECIMAL(18, 2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(50) NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('bank_transfer', 'credit_card', 'digital_wallet')),
  reference_number VARCHAR(255),
  proof_url VARCHAR(500),
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected', 'processing')),
  verified_by UUID REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  verified_at TIMESTAMP,
  verification_notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);
CREATE INDEX idx_withdrawals_created_at ON withdrawals(created_at DESC);

CREATE INDEX idx_deposits_user_id ON deposits(user_id);
CREATE INDEX idx_deposits_status ON deposits(status);
CREATE INDEX idx_deposits_reference_number ON deposits(reference_number);
CREATE INDEX idx_deposits_created_at ON deposits(created_at DESC);

-- Add comments
COMMENT ON TABLE withdrawals IS 'User withdrawal requests and processing';
COMMENT ON TABLE deposits IS 'User deposit tracking and verification';
COMMENT ON COLUMN withdrawals.bank_details IS 'IBAN, account holder name, bank name, etc.';
COMMENT ON COLUMN deposits.proof_url IS 'URL to uploaded payment proof/receipt';
