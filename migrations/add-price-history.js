// migrations/add-price-history.js
// Creates the price_history table for OHLCV candlestick data

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Check if table already exists
      const tables = await queryInterface.sequelize.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'price_history'",
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      if (tables.length > 0) {
        console.log('ℹ️ price_history table already exists, skipping...');
        await transaction.commit();
        return;
      }

      // Create price_history table
      await queryInterface.createTable('price_history', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        market_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'markets',
            key: 'id'
          },
          onDelete: 'CASCADE'
        },
        outcome: {
          type: Sequelize.BOOLEAN,
          allowNull: false
        },
        interval: {
          type: Sequelize.ENUM('1m', '5m', '15m', '1h', '4h', '1d'),
          allowNull: false,
          defaultValue: '1h'
        },
        timestamp: {
          type: Sequelize.DATE,
          allowNull: false
        },
        open: {
          type: Sequelize.DECIMAL(10, 4),
          allowNull: false
        },
        high: {
          type: Sequelize.DECIMAL(10, 4),
          allowNull: false
        },
        low: {
          type: Sequelize.DECIMAL(10, 4),
          allowNull: false
        },
        close: {
          type: Sequelize.DECIMAL(10, 4),
          allowNull: false
        },
        volume: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        trade_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        vwap: {
          type: Sequelize.DECIMAL(10, 4),
          allowNull: true
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      }, { transaction });

      console.log('✅ price_history table created');

      // Add indexes
      await queryInterface.addIndex('price_history', ['market_id', 'outcome', 'interval', 'timestamp'], {
        unique: true,
        name: 'idx_price_history_unique',
        transaction
      });
      console.log('✅ idx_price_history_unique index added');

      await queryInterface.addIndex('price_history', ['market_id', 'outcome', 'interval'], {
        name: 'idx_price_history_market_interval',
        transaction
      });
      console.log('✅ idx_price_history_market_interval index added');

      await queryInterface.addIndex('price_history', ['timestamp'], {
        name: 'idx_price_history_timestamp',
        transaction
      });
      console.log('✅ idx_price_history_timestamp index added');

      await transaction.commit();
      console.log('✅ Price history migration completed successfully');

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.dropTable('price_history', { transaction });

      // Drop ENUM type
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_price_history_interval"',
        { transaction }
      );

      await transaction.commit();
      console.log('✅ Price history migration rolled back');

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
