// migrations/add-refresh-tokens.js
const { DataTypes } = require('sequelize');

module.exports = {
  async up(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🚀 Creating refresh_tokens table...');

    // Check if table exists
    const tables = await queryInterface.showAllTables();
    if (tables.includes('refresh_tokens')) {
      console.log('ℹ️ refresh_tokens table already exists');
      return;
    }

    await queryInterface.createTable('refresh_tokens', {
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
      token: {
        type: DataTypes.STRING(500),
        allowNull: false,
        unique: true
      },
      device_info: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false
      },
      revoked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      revoked_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes
    await queryInterface.addIndex('refresh_tokens', ['user_id']);
    await queryInterface.addIndex('refresh_tokens', ['token']);
    await queryInterface.addIndex('refresh_tokens', ['expires_at']);

    console.log('✅ refresh_tokens table created successfully!');
  },

  async down(sequelize) {
    const queryInterface = sequelize.getQueryInterface();
    await queryInterface.dropTable('refresh_tokens');
  }
};
