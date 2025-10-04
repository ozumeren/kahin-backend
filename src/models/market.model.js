// src/models/market.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Market = sequelize.define('Market', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true // Açıklama zorunlu olmayabilir
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'open' // Olası değerler: 'open', 'closed', 'resolved'
  },
  closing_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  outcome: {
    type: DataTypes.BOOLEAN,
    allowNull: true // Pazar sonuçlanana kadar bu alan boş (null) olacak
  }
}, {
  tableName: 'markets'
});

module.exports = Market;