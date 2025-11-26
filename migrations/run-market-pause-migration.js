// migrations/run-market-pause-migration.js
const sequelize = require('../config/database');

async function runMigration() {
  try {
    console.log('🚀 Starting market pause fields migration...\n');

    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection successful\n');

    const queryInterface = sequelize.getQueryInterface();

    // Get existing columns
    const tableDescription = await queryInterface.describeTable('markets');

    console.log('📋 Current columns in markets table:');
    console.log(Object.keys(tableDescription).join(', '));
    console.log('');

    // Add is_paused
    if (!tableDescription.is_paused) {
      console.log('➕ Adding is_paused column...');
      await sequelize.query(`
        ALTER TABLE markets
        ADD COLUMN is_paused BOOLEAN DEFAULT false;
      `);
      console.log('✅ is_paused added');
    } else {
      console.log('⏭️  is_paused already exists');
    }

    // Add paused_at
    if (!tableDescription.paused_at) {
      console.log('➕ Adding paused_at column...');
      await sequelize.query(`
        ALTER TABLE markets
        ADD COLUMN paused_at TIMESTAMP;
      `);
      console.log('✅ paused_at added');
    } else {
      console.log('⏭️  paused_at already exists');
    }

    // Add paused_by
    if (!tableDescription.paused_by) {
      console.log('➕ Adding paused_by column...');
      await sequelize.query(`
        ALTER TABLE markets
        ADD COLUMN paused_by UUID;
      `);
      console.log('✅ paused_by added');
    } else {
      console.log('⏭️  paused_by already exists');
    }

    // Add pause_reason
    if (!tableDescription.pause_reason) {
      console.log('➕ Adding pause_reason column...');
      await sequelize.query(`
        ALTER TABLE markets
        ADD COLUMN pause_reason TEXT;
      `);
      console.log('✅ pause_reason added');
    } else {
      console.log('⏭️  pause_reason already exists');
    }

    console.log('\n✅ Migration completed successfully!\n');

    // Verify
    const newTableDescription = await queryInterface.describeTable('markets');
    const pauseFields = ['is_paused', 'paused_at', 'paused_by', 'pause_reason'];
    const existingPauseFields = pauseFields.filter(field => newTableDescription[field]);

    console.log('📊 Verification:');
    console.log(`Found ${existingPauseFields.length}/4 pause fields:`, existingPauseFields.join(', '));

    await sequelize.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    await sequelize.close();
    process.exit(1);
  }
}

runMigration();
