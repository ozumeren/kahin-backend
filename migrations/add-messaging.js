// migrations/add-messaging.js
const { DataTypes } = require('sequelize');

module.exports = {
  async up(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🚀 Creating messaging tables...');

    // Check if tables already exist
    const tables = await queryInterface.showAllTables();

    // ========== 1. CONVERSATIONS TABLE ==========
    if (!tables.includes('conversations')) {
      console.log('  Creating conversations table...');

      // Create ENUM type for conversation type
      await sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE conversation_type AS ENUM ('private', 'group');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      await queryInterface.createTable('conversations', {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        type: {
          type: DataTypes.ENUM('private', 'group'),
          allowNull: false,
          defaultValue: 'private'
        },
        title: {
          type: DataTypes.STRING(255),
          allowNull: true,
          defaultValue: null
        },
        created_by: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        last_message_at: {
          type: DataTypes.DATE,
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

      // Add indexes
      await queryInterface.addIndex('conversations', ['created_by']);
      await queryInterface.addIndex('conversations', ['type']);
      await queryInterface.addIndex('conversations', ['last_message_at']);

      console.log('  ✅ conversations table created');
    } else {
      console.log('  ℹ️ conversations table already exists');
    }

    // ========== 2. CONVERSATION_PARTICIPANTS TABLE ==========
    if (!tables.includes('conversation_participants')) {
      console.log('  Creating conversation_participants table...');

      // Create ENUM type for participant role
      await sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE participant_role AS ENUM ('admin', 'member');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      await queryInterface.createTable('conversation_participants', {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        conversation_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'conversations',
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
        role: {
          type: DataTypes.ENUM('admin', 'member'),
          allowNull: false,
          defaultValue: 'member'
        },
        last_read_at: {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null
        },
        is_muted: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        joined_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
        },
        left_at: {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null
        }
      });

      // Add indexes
      await queryInterface.addIndex('conversation_participants', ['conversation_id']);
      await queryInterface.addIndex('conversation_participants', ['user_id']);
      await queryInterface.addIndex('conversation_participants', ['conversation_id', 'user_id'], {
        unique: true,
        name: 'idx_conversation_user_unique'
      });

      console.log('  ✅ conversation_participants table created');
    } else {
      console.log('  ℹ️ conversation_participants table already exists');
    }

    // ========== 3. MESSAGES TABLE ==========
    if (!tables.includes('messages')) {
      console.log('  Creating messages table...');

      // Create ENUM type for message type
      await sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE message_type AS ENUM ('text', 'image', 'file', 'system');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      await queryInterface.createTable('messages', {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        conversation_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'conversations',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        sender_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        content: {
          type: DataTypes.TEXT,
          allowNull: false
        },
        message_type: {
          type: DataTypes.ENUM('text', 'image', 'file', 'system'),
          allowNull: false,
          defaultValue: 'text'
        },
        attachment_url: {
          type: DataTypes.STRING(500),
          allowNull: true,
          defaultValue: null
        },
        reply_to_id: {
          type: DataTypes.UUID,
          allowNull: true,
          defaultValue: null,
          references: {
            model: 'messages',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        is_edited: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        edited_at: {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null
        },
        is_deleted: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        deleted_at: {
          type: DataTypes.DATE,
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
      await queryInterface.addIndex('messages', ['conversation_id']);
      await queryInterface.addIndex('messages', ['sender_id']);
      await queryInterface.addIndex('messages', ['conversation_id', 'created_at']);
      await queryInterface.addIndex('messages', ['reply_to_id']);

      console.log('  ✅ messages table created');
    } else {
      console.log('  ℹ️ messages table already exists');
    }

    console.log('✅ Messaging tables migration completed!');
  },

  async down(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🔄 Dropping messaging tables...');

    // Drop tables in reverse order (due to foreign key constraints)
    await queryInterface.dropTable('messages');
    await queryInterface.dropTable('conversation_participants');
    await queryInterface.dropTable('conversations');

    // Drop ENUM types
    await sequelize.query('DROP TYPE IF EXISTS message_type;');
    await sequelize.query('DROP TYPE IF EXISTS participant_role;');
    await sequelize.query('DROP TYPE IF EXISTS conversation_type;');

    console.log('✅ Messaging tables dropped!');
  }
};
