// migrations/create-resolution-history.js
const { DataTypes } = require('sequelize');

module.exports = {
  async up(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🚀 Creating resolution_history table...');

    await queryInterface.createTable('resolution_history', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      market_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'markets',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      outcome: {
        type: DataTypes.BOOLEAN,
        allowNull: true
      },
      resolution_type: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'normal'
      },
      resolved_by: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      resolution_notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      resolution_evidence: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      total_holders: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      winners_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      losers_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      total_payout: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0
      },
      open_orders_cancelled: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      previous_outcome: {
        type: DataTypes.BOOLEAN,
        allowNull: true
      },
      correction_reason: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      resolved_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    });

    // Create indexes
    console.log('📊 Creating indexes...');

    await queryInterface.addIndex('resolution_history', ['market_id'], {
      name: 'idx_resolution_history_market'
    });

    await queryInterface.addIndex('resolution_history', ['resolved_by'], {
      name: 'idx_resolution_history_resolved_by'
    });

    await queryInterface.addIndex('resolution_history', ['resolution_type'], {
      name: 'idx_resolution_history_type'
    });

    await queryInterface.addIndex('resolution_history', ['resolved_at'], {
      name: 'idx_resolution_history_date'
    });

    console.log('✅ resolution_history table created successfully!');
  },

  async down(sequelize) {
    const queryInterface = sequelize.getQueryInterface();
    await queryInterface.dropTable('resolution_history');
  }
};
