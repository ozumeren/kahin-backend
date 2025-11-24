// src/models/conversationParticipant.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ConversationParticipant = sequelize.define('ConversationParticipant', {
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
    }
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
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
    defaultValue: DataTypes.NOW
  },
  left_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  }
}, {
  tableName: 'conversation_participants',
  timestamps: false,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['conversation_id', 'user_id']
    }
  ]
});

module.exports = ConversationParticipant;
