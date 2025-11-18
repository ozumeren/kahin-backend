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

      // 2. Markets tablosuna yeni kolonlar ekle (IF NOT EXISTS kontrolü ile)
      
      // market_type kolonu kontrolü
      const [marketTypeColumn] = await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name='markets' AND column_name='market_type';`,
        { transaction }
      );
      
      if (marketTypeColumn.length === 0) {
        await queryInterface.addColumn('markets', 'market_type', {
          type: Sequelize.ENUM('binary', 'multiple_choice'),
          allowNull: false,
          defaultValue: 'binary'
        }, { transaction });
        console.log('✅ market_type kolonu eklendi');
      } else {
        console.log('ℹ️ market_type kolonu zaten mevcut');
      }

      // category kolonu kontrolü
      const [categoryColumn] = await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name='markets' AND column_name='category';`,
        { transaction }
      );
      
      if (categoryColumn.length === 0) {
        await queryInterface.addColumn('markets', 'category', {
          type: Sequelize.STRING,
          allowNull: true
        }, { transaction });
        console.log('✅ category kolonu eklendi');
      } else {
        console.log('ℹ️ category kolonu zaten mevcut');
      }

      // image_url kolonu kontrolü
      const [imageUrlColumn] = await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name='markets' AND column_name='image_url';`,
        { transaction }
      );
      
      if (imageUrlColumn.length === 0) {
        await queryInterface.addColumn('markets', 'image_url', {
          type: Sequelize.STRING,
          allowNull: true
        }, { transaction });
        console.log('✅ image_url kolonu eklendi');
      } else {
        console.log('ℹ️ image_url kolonu zaten mevcut');
      }

      // 3. market_options tablosu kontrolü
      const [marketOptionsTable] = await queryInterface.sequelize.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_name='market_options';`,
        { transaction }
      );
      
      if (marketOptionsTable.length === 0) {
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
        console.log('✅ market_options tablosu oluşturuldu');
      } else {
        console.log('ℹ️ market_options tablosu zaten mevcut');
      }

      // 4. option_positions tablosu kontrolü
      const [optionPositionsTable] = await queryInterface.sequelize.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_name='option_positions';`,
        { transaction }
      );
      
      if (optionPositionsTable.length === 0) {
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
        console.log('✅ option_positions tablosu oluşturuldu');
      } else {
        console.log('ℹ️ option_positions tablosu zaten mevcut');
      }

      // 5. option_trades tablosu kontrolü
      const [optionTradesTable] = await queryInterface.sequelize.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_name='option_trades';`,
        { transaction }
      );
      
      if (optionTradesTable.length === 0) {
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
        console.log('✅ option_trades tablosu oluşturuldu');
      } else {
        console.log('ℹ️ option_trades tablosu zaten mevcut');
      }

      // 6. İndeksler oluştur (sadece yoksa)
      try {
        await queryInterface.addIndex('market_options', ['market_id'], {
          name: 'idx_market_options_market_id',
          transaction
        });
        console.log('✅ market_options index oluşturuldu');
      } catch (e) {
        console.log('ℹ️ market_options index zaten mevcut');
      }

      try {
        await queryInterface.addIndex('option_positions', ['user_id'], {
          name: 'idx_option_positions_user_id',
          transaction
        });
        console.log('✅ option_positions user_id index oluşturuldu');
      } catch (e) {
        console.log('ℹ️ option_positions user_id index zaten mevcut');
      }

      try {
        await queryInterface.addIndex('option_positions', ['option_id'], {
          name: 'idx_option_positions_option_id',
          transaction
        });
        console.log('✅ option_positions option_id index oluşturuldu');
      } catch (e) {
        console.log('ℹ️ option_positions option_id index zaten mevcut');
      }

      try {
        await queryInterface.addIndex('option_positions', 
          ['user_id', 'option_id', 'position_type'], 
          {
            unique: true,
            name: 'idx_option_positions_unique',
            transaction
          }
        );
        console.log('✅ option_positions unique index oluşturuldu');
      } catch (e) {
        console.log('ℹ️ option_positions unique index zaten mevcut');
      }

      try {
        await queryInterface.addIndex('option_trades', ['user_id'], {
          name: 'idx_option_trades_user_id',
          transaction
        });
        console.log('✅ option_trades user_id index oluşturuldu');
      } catch (e) {
        console.log('ℹ️ option_trades user_id index zaten mevcut');
      }

      try {
        await queryInterface.addIndex('option_trades', ['option_id'], {
          name: 'idx_option_trades_option_id',
          transaction
        });
        console.log('✅ option_trades option_id index oluşturuldu');
      } catch (e) {
        console.log('ℹ️ option_trades option_id index zaten mevcut');
      }

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
      await queryInterface.dropTable('option_trades', { transaction });
      await queryInterface.dropTable('option_positions', { transaction });
      await queryInterface.dropTable('market_options', { transaction });
      
      await queryInterface.removeColumn('markets', 'image_url', { transaction });
      await queryInterface.removeColumn('markets', 'category', { transaction });
      await queryInterface.removeColumn('markets', 'market_type', { transaction });
      
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