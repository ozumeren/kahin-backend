// src/models/optionPosition.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const OptionPosition = sequelize.define('OptionPosition', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  option_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'market_options',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  position_type: {
    type: DataTypes.ENUM('YES', 'NO'),
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  average_price: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false
  },
  total_invested: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false
  }
}, {
  tableName: 'option_positions',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'option_id', 'position_type']
    }
  ]
});

module.exports = OptionPosition;