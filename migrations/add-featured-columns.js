// migrations/add-featured-columns.js
const { DataTypes } = require('sequelize');

module.exports = {
  async up(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🚀 Starting featured columns migration...');

    // Check if column already exists
    try {
      const tableDescription = await queryInterface.describeTable('markets');
      if (tableDescription.featured) {
        console.log('ℹ️  featured column already exists, skipping migration...');
        return;
      }
    } catch (error) {
      console.log('Error checking table:', error.message);
    }

    // Add featured column
    console.log('➕ Adding featured column...');
    await queryInterface.addColumn('markets', 'featured', {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    });

    // Add featured_at column
    console.log('➕ Adding featured_at column...');
    await queryInterface.addColumn('markets', 'featured_at', {
      type: DataTypes.DATE,
      allowNull: true
    });

    // Add featured_weight column
    console.log('➕ Adding featured_weight column...');
    await queryInterface.addColumn('markets', 'featured_weight', {
      type: DataTypes.INTEGER,
      defaultValue: 0
    });

    // Add index for featured queries
    console.log('🔍 Adding index for featured columns...');
    try {
      await queryInterface.addIndex('markets', ['featured', 'featured_weight', 'createdAt'], {
        name: 'idx_markets_featured'
      });
    } catch (error) {
      console.log('Index may already exist:', error.message);
    }

    console.log('✅ Featured columns migration complete!');
  },

  async down(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🔄 Reverting featured columns migration...');

    try {
      await queryInterface.removeIndex('markets', 'idx_markets_featured');
    } catch (error) {
      console.log('Index removal failed:', error.message);
    }

    await queryInterface.removeColumn('markets', 'featured_weight');
    await queryInterface.removeColumn('markets', 'featured_at');
    await queryInterface.removeColumn('markets', 'featured');

    console.log('✅ Featured columns rollback complete!');
  }
};
