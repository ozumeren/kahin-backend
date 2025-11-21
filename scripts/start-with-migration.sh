#!/bin/sh
set -e  # Exit immediately if a command fails

echo "🚀 Running migrations..."

# Run category migration
echo "📝 Running add-category-to-markets migration..."
node scripts/run-migration.js add-category-to-markets.js || {
  echo "❌ Category migration failed!"
  exit 1
}

# Run market contracts migration
echo "📝 Running add-market-contracts migration..."
node scripts/run-migration.js add-market-contracts.js || {
  echo "❌ Market contracts migration failed!"
  exit 1
}

echo "✅ All migrations completed successfully!"
echo "🚀 Starting application..."

# Start the application
npm run start
