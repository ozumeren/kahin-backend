// src/models/conversation.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Conversation = sequelize.define('Conversation', {
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
    allowNull: true, // Grup konuşmaları için başlık
    defaultValue: null
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  last_message_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'conversations',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Conversation;
