// migrations/fix-order-price-nullable.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔄 Making orders.price column nullable...');

    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE "orders" ALTER COLUMN "price" DROP NOT NULL;`
      );
      console.log('✅ orders.price is now nullable');
    } catch (error) {
      console.log('ℹ️ Column may already be nullable:', error.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 Making orders.price NOT NULL...');
    await queryInterface.sequelize.query(
      `ALTER TABLE "orders" ALTER COLUMN "price" SET NOT NULL;`
    );
  }
};
