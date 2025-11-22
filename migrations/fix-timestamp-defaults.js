// migrations/fix-timestamp-defaults.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔄 Fixing timestamp defaults...');

    const tables = ['users', 'markets', 'shares', 'transactions', 'orders', 'trades'];

    for (const tableName of tables) {
      try {
        // Check if table exists
        const tableDesc = await queryInterface.describeTable(tableName);

        // Set default for created_at
        if (tableDesc.created_at) {
          await queryInterface.sequelize.query(
            `ALTER TABLE "${tableName}" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;`
          );
          console.log(`✅ ${tableName}.created_at default set`);
        }

        // Set default for updated_at
        if (tableDesc.updated_at) {
          await queryInterface.sequelize.query(
            `ALTER TABLE "${tableName}" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;`
          );
          console.log(`✅ ${tableName}.updated_at default set`);
        }

        // Also check for camelCase versions (createdAt, updatedAt)
        if (tableDesc.createdAt) {
          await queryInterface.sequelize.query(
            `ALTER TABLE "${tableName}" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;`
          );
          console.log(`✅ ${tableName}.createdAt default set`);
        }

        if (tableDesc.updatedAt) {
          await queryInterface.sequelize.query(
            `ALTER TABLE "${tableName}" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;`
          );
          console.log(`✅ ${tableName}.updatedAt default set`);
        }
      } catch (error) {
        console.log(`ℹ️ Skipping ${tableName}: ${error.message}`);
      }
    }

    console.log('✅ Timestamp defaults migration complete!');
  },

  down: async (queryInterface, Sequelize) => {
    // No rollback needed for defaults
    console.log('ℹ️ No rollback needed for timestamp defaults');
  }
};
