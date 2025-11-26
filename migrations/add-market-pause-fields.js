// migrations/add-market-pause-fields.js
const { DataTypes } = require('sequelize');

module.exports = {
  async up(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🚀 Adding market pause/health fields...');

    const tableDescription = await queryInterface.describeTable('markets');

    // Add is_paused column if not exists
    if (!tableDescription.is_paused) {
      console.log('➕ Adding is_paused column...');
      await queryInterface.addColumn('markets', 'is_paused', {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      });
    }

    // Add paused_at column if not exists
    if (!tableDescription.paused_at) {
      console.log('➕ Adding paused_at column...');
      await queryInterface.addColumn('markets', 'paused_at', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }

    // Add paused_by column if not exists
    if (!tableDescription.paused_by) {
      console.log('➕ Adding paused_by column...');
      await queryInterface.addColumn('markets', 'paused_by', {
        type: DataTypes.UUID,
        allowNull: true
      });
    }

    // Add pause_reason column if not exists
    if (!tableDescription.pause_reason) {
      console.log('➕ Adding pause_reason column...');
      await queryInterface.addColumn('markets', 'pause_reason', {
        type: DataTypes.TEXT,
        allowNull: true
      });
    }

    console.log('✅ Market pause fields migration complete!');
  },

  async down(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    await queryInterface.removeColumn('markets', 'pause_reason');
    await queryInterface.removeColumn('markets', 'paused_by');
    await queryInterface.removeColumn('markets', 'paused_at');
    await queryInterface.removeColumn('markets', 'is_paused');
  }
};
