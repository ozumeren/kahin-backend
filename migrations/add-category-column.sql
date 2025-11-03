-- Add category column to markets table
ALTER TABLE markets 
ADD COLUMN IF NOT EXISTS category VARCHAR(255) DEFAULT 'politics';

-- Update existing markets to have a default category
UPDATE markets 
SET category = 'politics' 
WHERE category IS NULL;
