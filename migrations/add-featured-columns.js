// migrations/add-featured-columns.js
const { DataTypes } = require('sequelize');

module.exports = {
  async up(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🚀 Starting featured columns migration...');

    const tableDescription = await queryInterface.describeTable('markets');

    // Add featured column if not exists
    if (!tableDescription.featured) {
      console.log('➕ Adding featured column...');
      await queryInterface.addColumn('markets', 'featured', {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      });
    }

    // Add featured_at column if not exists
    if (!tableDescription.featured_at) {
      console.log('➕ Adding featured_at column...');
      await queryInterface.addColumn('markets', 'featured_at', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }

    // Add featured_weight column if not exists
    if (!tableDescription.featured_weight) {
      console.log('➕ Adding featured_weight column...');
      await queryInterface.addColumn('markets', 'featured_weight', {
        type: DataTypes.INTEGER,
        defaultValue: 0
      });
    }

    // Add view_count column if not exists
    if (!tableDescription.view_count) {
      console.log('➕ Adding view_count column...');
      await queryInterface.addColumn('markets', 'view_count', {
        type: DataTypes.INTEGER,
        defaultValue: 0
      });
    }

    // Add tags column if not exists
    if (!tableDescription.tags) {
      console.log('➕ Adding tags column...');
      await queryInterface.addColumn('markets', 'tags', {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: []
      });
    }

    // Add seo_slug column if not exists
    if (!tableDescription.seo_slug) {
      console.log('➕ Adding seo_slug column...');
      await queryInterface.addColumn('markets', 'seo_slug', {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
      });
    }

    // Add indexes
    console.log('🔍 Adding indexes...');
    try {
      await queryInterface.addIndex('markets', ['featured', 'featured_weight', 'createdAt'], {
        name: 'idx_markets_featured'
      });
    } catch (error) {
      console.log('Featured index may already exist');
    }

    try {
      await queryInterface.addIndex('markets', ['view_count'], {
        name: 'idx_markets_view_count'
      });
    } catch (error) {
      console.log('View count index may already exist');
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
