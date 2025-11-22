// migrations/add-user-ban-fields.js
const { DataTypes } = require('sequelize');

module.exports = {
  async up(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🚀 Adding user ban fields...');

    const tableDescription = await queryInterface.describeTable('users');

    // Add banned column if not exists
    if (!tableDescription.banned) {
      console.log('➕ Adding banned column...');
      await queryInterface.addColumn('users', 'banned', {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      });
    }

    // Add banned_at column if not exists
    if (!tableDescription.banned_at) {
      console.log('➕ Adding banned_at column...');
      await queryInterface.addColumn('users', 'banned_at', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }

    // Add banned_by column if not exists
    if (!tableDescription.banned_by) {
      console.log('➕ Adding banned_by column...');
      await queryInterface.addColumn('users', 'banned_by', {
        type: DataTypes.UUID,
        allowNull: true
      });
    }

    // Add ban_reason column if not exists
    if (!tableDescription.ban_reason) {
      console.log('➕ Adding ban_reason column...');
      await queryInterface.addColumn('users', 'ban_reason', {
        type: DataTypes.TEXT,
        allowNull: true
      });
    }

    console.log('✅ User ban fields migration complete!');
  },

  async down(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    await queryInterface.removeColumn('users', 'ban_reason');
    await queryInterface.removeColumn('users', 'banned_by');
    await queryInterface.removeColumn('users', 'banned_at');
    await queryInterface.removeColumn('users', 'banned');
  }
};
