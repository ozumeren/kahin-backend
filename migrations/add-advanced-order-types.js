// migrations/add-advanced-order-types.js
// Adds support for Market Orders, Order Expiration, and Stop-Loss/Take-Profit

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Check if columns already exist
      const tableInfo = await queryInterface.describeTable('orders');

      // 1. Add order_type column (LIMIT, MARKET, STOP_LOSS, TAKE_PROFIT, STOP_LIMIT)
      if (!tableInfo.order_type) {
        await queryInterface.addColumn('orders', 'order_type', {
          type: Sequelize.ENUM('LIMIT', 'MARKET', 'STOP_LOSS', 'TAKE_PROFIT', 'STOP_LIMIT'),
          allowNull: false,
          defaultValue: 'LIMIT'
        }, { transaction });
        console.log('✅ order_type column added');
      }

      // 2. Add time_in_force column (GTC, GTD, IOC, FOK)
      // GTC = Good-Til-Cancelled (default, stays until filled or cancelled)
      // GTD = Good-Til-Date (expires at specified time)
      // IOC = Immediate-Or-Cancel (fill what you can immediately, cancel rest)
      // FOK = Fill-Or-Kill (fill entire order immediately or cancel)
      if (!tableInfo.time_in_force) {
        await queryInterface.addColumn('orders', 'time_in_force', {
          type: Sequelize.ENUM('GTC', 'GTD', 'IOC', 'FOK'),
          allowNull: false,
          defaultValue: 'GTC'
        }, { transaction });
        console.log('✅ time_in_force column added');
      }

      // 3. Add expires_at column for GTD orders
      if (!tableInfo.expires_at) {
        await queryInterface.addColumn('orders', 'expires_at', {
          type: Sequelize.DATE,
          allowNull: true
        }, { transaction });
        console.log('✅ expires_at column added');
      }

      // 4. Add trigger_price for stop-loss/take-profit orders
      if (!tableInfo.trigger_price) {
        await queryInterface.addColumn('orders', 'trigger_price', {
          type: Sequelize.DECIMAL(10, 4),
          allowNull: true
        }, { transaction });
        console.log('✅ trigger_price column added');
      }

      // 5. Add triggered_at for when stop/take-profit was triggered
      if (!tableInfo.triggered_at) {
        await queryInterface.addColumn('orders', 'triggered_at', {
          type: Sequelize.DATE,
          allowNull: true
        }, { transaction });
        console.log('✅ triggered_at column added');
      }

      // 6. Add filled_quantity to track partial fills
      if (!tableInfo.filled_quantity) {
        await queryInterface.addColumn('orders', 'filled_quantity', {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        }, { transaction });
        console.log('✅ filled_quantity column added');
      }

      // 7. Add average_fill_price for executed orders
      if (!tableInfo.average_fill_price) {
        await queryInterface.addColumn('orders', 'average_fill_price', {
          type: Sequelize.DECIMAL(10, 4),
          allowNull: true
        }, { transaction });
        console.log('✅ average_fill_price column added');
      }

      // 8. Add parent_order_id for linked orders (e.g., OCO - One-Cancels-Other)
      if (!tableInfo.parent_order_id) {
        await queryInterface.addColumn('orders', 'parent_order_id', {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'orders',
            key: 'id'
          },
          onDelete: 'SET NULL'
        }, { transaction });
        console.log('✅ parent_order_id column added');
      }

      // Add indexes for performance
      try {
        await queryInterface.addIndex('orders', ['order_type'], {
          name: 'idx_orders_order_type',
          transaction
        });
        console.log('✅ idx_orders_order_type index added');
      } catch (e) {
        if (!e.message.includes('already exists')) throw e;
      }

      try {
        await queryInterface.addIndex('orders', ['expires_at'], {
          name: 'idx_orders_expires_at',
          where: { expires_at: { [Sequelize.Op.ne]: null } },
          transaction
        });
        console.log('✅ idx_orders_expires_at index added');
      } catch (e) {
        if (!e.message.includes('already exists')) throw e;
      }

      try {
        await queryInterface.addIndex('orders', ['trigger_price'], {
          name: 'idx_orders_trigger_price',
          where: { trigger_price: { [Sequelize.Op.ne]: null } },
          transaction
        });
        console.log('✅ idx_orders_trigger_price index added');
      } catch (e) {
        if (!e.message.includes('already exists')) throw e;
      }

      try {
        await queryInterface.addIndex('orders', ['status', 'order_type'], {
          name: 'idx_orders_status_type',
          transaction
        });
        console.log('✅ idx_orders_status_type index added');
      } catch (e) {
        if (!e.message.includes('already exists')) throw e;
      }

      await transaction.commit();
      console.log('✅ Advanced order types migration completed successfully');

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Remove indexes
      await queryInterface.removeIndex('orders', 'idx_orders_order_type', { transaction }).catch(() => {});
      await queryInterface.removeIndex('orders', 'idx_orders_expires_at', { transaction }).catch(() => {});
      await queryInterface.removeIndex('orders', 'idx_orders_trigger_price', { transaction }).catch(() => {});
      await queryInterface.removeIndex('orders', 'idx_orders_status_type', { transaction }).catch(() => {});

      // Remove columns
      await queryInterface.removeColumn('orders', 'parent_order_id', { transaction }).catch(() => {});
      await queryInterface.removeColumn('orders', 'average_fill_price', { transaction }).catch(() => {});
      await queryInterface.removeColumn('orders', 'filled_quantity', { transaction }).catch(() => {});
      await queryInterface.removeColumn('orders', 'triggered_at', { transaction }).catch(() => {});
      await queryInterface.removeColumn('orders', 'trigger_price', { transaction }).catch(() => {});
      await queryInterface.removeColumn('orders', 'expires_at', { transaction }).catch(() => {});
      await queryInterface.removeColumn('orders', 'time_in_force', { transaction }).catch(() => {});
      await queryInterface.removeColumn('orders', 'order_type', { transaction }).catch(() => {});

      await transaction.commit();
      console.log('✅ Advanced order types migration rolled back');

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
