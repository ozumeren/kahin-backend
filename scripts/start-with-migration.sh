#!/bin/sh

echo "🚀 Running migrations..."

# Run category migration
node scripts/run-migration.js add-category-to-markets.js

echo "✅ Migrations completed"
echo "🚀 Starting application..."

# Start the application
npm run start
