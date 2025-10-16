// migrations/add-multiple-choice-support.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // 1. Market tipi için ENUM oluştur
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE market_type AS ENUM ('binary', 'multiple_choice');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // 2. Markets tablosuna yeni kolonlar ekle
      await queryInterface.addColumn('markets', 'market_type', {
        type: Sequelize.ENUM('binary', 'multiple_choice'),
        allowNull: false,
        defaultValue: 'binary'
      }, { transaction });

      await queryInterface.addColumn('markets', 'category', {
        type: DataTypes.STRING,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('markets', 'image_url', {
        type: Sequelize.STRING,
        allowNull: true
      }, { transaction });

      // 3. Market Options tablosunu oluştur
      await queryInterface.createTable('market_options', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
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
        option_text: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        option_image_url: {
          type: Sequelize.STRING(500),
          allowNull: true
        },
        option_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        total_yes_volume: {
          type: Sequelize.DECIMAL(20, 2),
          defaultValue: 0
        },
        total_no_volume: {
          type: Sequelize.DECIMAL(20, 2),
          defaultValue: 0
        },
        yes_price: {
          type: Sequelize.DECIMAL(5, 2),
          defaultValue: 50.00
        },
        no_price: {
          type: Sequelize.DECIMAL(5, 2),
          defaultValue: 50.00
        },
        probability: {
          type: Sequelize.DECIMAL(5, 2),
          defaultValue: 50.00
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      }, { transaction });

      // 4. Option Positions tablosunu oluştur
      await queryInterface.createTable('option_positions', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          },
          onDelete: 'CASCADE'
        },
        option_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'market_options',
            key: 'id'
          },
          onDelete: 'CASCADE'
        },
        position_type: {
          type: Sequelize.ENUM('YES', 'NO'),
          allowNull: false
        },
        quantity: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        average_price: {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: false
        },
        total_invested: {
          type: Sequelize.DECIMAL(20, 2),
          allowNull: false
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      }, { transaction });

      // 5. Option Trades tablosunu oluştur
      await queryInterface.createTable('option_trades', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          },
          onDelete: 'CASCADE'
        },
        option_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'market_options',
            key: 'id'
          },
          onDelete: 'CASCADE'
        },
        trade_type: {
          type: Sequelize.ENUM('BUY', 'SELL'),
          allowNull: false
        },
        position_type: {
          type: Sequelize.ENUM('YES', 'NO'),
          allowNull: false
        },
        quantity: {
          type: Sequelize.INTEGER,
          allowNull: false
        },
        price: {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: false
        },
        total_amount: {
          type: Sequelize.DECIMAL(20, 2),
          allowNull: false
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      }, { transaction });

      // 6. İndeksler oluştur
      await queryInterface.addIndex('market_options', ['market_id'], {
        name: 'idx_market_options_market_id',
        transaction
      });

      await queryInterface.addIndex('option_positions', ['user_id'], {
        name: 'idx_option_positions_user_id',
        transaction
      });

      await queryInterface.addIndex('option_positions', ['option_id'], {
        name: 'idx_option_positions_option_id',
        transaction
      });

      await queryInterface.addIndex('option_positions', 
        ['user_id', 'option_id', 'position_type'], 
        {
          unique: true,
          name: 'idx_option_positions_unique',
          transaction
        }
      );

      await queryInterface.addIndex('option_trades', ['user_id'], {
        name: 'idx_option_trades_user_id',
        transaction
      });

      await queryInterface.addIndex('option_trades', ['option_id'], {
        name: 'idx_option_trades_option_id',
        transaction
      });

      await transaction.commit();
      console.log('✅ Multiple choice support migration completed!');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Tabloları sil (sıra önemli - foreign key'ler yüzünden)
      await queryInterface.dropTable('option_trades', { transaction });
      await queryInterface.dropTable('option_positions', { transaction });
      await queryInterface.dropTable('market_options', { transaction });
      
      // Markets tablosundaki kolonları sil
      await queryInterface.removeColumn('markets', 'image_url', { transaction });
      await queryInterface.removeColumn('markets', 'category', { transaction });
      await queryInterface.removeColumn('markets', 'market_type', { transaction });
      
      // ENUM tiplerini sil
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS market_type;', { transaction });

      await transaction.commit();
      console.log('✅ Rollback completed!');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};