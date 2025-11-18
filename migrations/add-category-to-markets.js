// migrations/add-category-to-markets.js
const { Sequelize } = require('sequelize');

module.exports = {
  async up(sequelize) {
    const queryInterface = sequelize.getQueryInterface();
    const tableDescription = await queryInterface.describeTable('markets');
    
    // Check if category column already exists
    if (!tableDescription.category) {
      await queryInterface.addColumn('markets', 'category', {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'politics'
      });
      console.log('✅ Added category column to markets table');
    } else {
      console.log('ℹ️  Category column already exists in markets table');
    }
  },

  async down(sequelize) {
    const queryInterface = sequelize.getQueryInterface();
    await queryInterface.removeColumn('markets', 'category');
    console.log('✅ Removed category column from markets table');
  }
};
