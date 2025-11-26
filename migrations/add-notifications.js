// migrations/add-notifications.js
const { DataTypes } = require('sequelize');

module.exports = {
  async up(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🚀 Creating notifications table...');

    // Check if table already exists
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('notifications')) {
      console.log('  Creating notifications table...');

      // Create ENUM type for notification type
      await sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE notification_type AS ENUM ('message', 'trade', 'market_update', 'system', 'order', 'portfolio');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      await queryInterface.createTable('notifications', {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false
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
        type: {
          type: DataTypes.ENUM('message', 'trade', 'market_update', 'system', 'order', 'portfolio'),
          allowNull: false,
          defaultValue: 'system'
        },
        title: {
          type: DataTypes.STRING(255),
          allowNull: false
        },
        message: {
          type: DataTypes.TEXT,
          allowNull: false
        },
        data: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: null
        },
        is_read: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        read_at: {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null
        },
        action_url: {
          type: DataTypes.STRING(500),
          allowNull: true,
          defaultValue: null
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
        }
      });

      // Add indexes for better query performance
      await queryInterface.addIndex('notifications', ['user_id']);
      await queryInterface.addIndex('notifications', ['user_id', 'is_read']);
      await queryInterface.addIndex('notifications', ['user_id', 'created_at']);
      await queryInterface.addIndex('notifications', ['type']);

      console.log('  ✅ notifications table created');
    } else {
      console.log('  ℹ️ notifications table already exists');
    }

    console.log('✅ Notifications table migration completed!');
  },

  async down(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🔄 Dropping notifications table...');

    await queryInterface.dropTable('notifications');

    // Drop ENUM type
    await sequelize.query('DROP TYPE IF EXISTS notification_type;');

    console.log('✅ Notifications table dropped!');
  }
};
