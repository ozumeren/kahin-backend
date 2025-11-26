// migrations/create-disputes.js
const { DataTypes } = require('sequelize');

module.exports = {
  async up(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🚀 Creating disputes table...');

    await queryInterface.createTable('disputes', {
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
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      dispute_type: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'incorrect_outcome'
      },
      dispute_reason: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      dispute_evidence: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending'
      },
      reviewed_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      review_notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      resolution_action: {
        type: DataTypes.STRING,
        allowNull: true
      },
      resolution_notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      upvotes: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      priority: {
        type: DataTypes.STRING,
        defaultValue: 'normal'
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

    await queryInterface.addIndex('disputes', ['market_id'], {
      name: 'idx_disputes_market'
    });

    await queryInterface.addIndex('disputes', ['user_id'], {
      name: 'idx_disputes_user'
    });

    await queryInterface.addIndex('disputes', ['status'], {
      name: 'idx_disputes_status'
    });

    await queryInterface.addIndex('disputes', ['dispute_type'], {
      name: 'idx_disputes_type'
    });

    await queryInterface.addIndex('disputes', ['priority', 'status'], {
      name: 'idx_disputes_priority'
    });

    await queryInterface.addIndex('disputes', ['createdAt'], {
      name: 'idx_disputes_created'
    });

    console.log('✅ disputes table created successfully!');
  },

  async down(sequelize) {
    const queryInterface = sequelize.getQueryInterface();
    await queryInterface.dropTable('disputes');
  }
};
