// src/models/order.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('BUY', 'SELL'), // Emir tipi: Alış veya Satış
    allowNull: false
  },
  outcome: {
    type: DataTypes.BOOLEAN, // true = 'Evet' hissesi, false = 'Hayır' hissesi
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  price: {
    type: DataTypes.DECIMAL(10, 2), // Hisse başına teklif edilen fiyat (örn: 0.65)
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('OPEN', 'FILLED', 'CANCELLED'), // Emir durumu
    allowNull: false,
    defaultValue: 'OPEN'
  }
}, {
  tableName: 'orders'
});

module.exports = Order;