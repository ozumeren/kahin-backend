// src/models/trade.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Trade = sequelize.define('Trade', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  // Alıcı bilgileri
  buyerId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  buyOrderId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'id'
    }
  },
  // Satıcı bilgileri
  sellerId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  sellOrderId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'id'
    }
  },
  // Market ve outcome
  marketId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'markets',
      key: 'id'
    }
  },
  outcome: {
    type: DataTypes.BOOLEAN, // true = YES, false = NO
    allowNull: false
  },
  // İşlem detayları
  quantity: {
    type: DataTypes.INTEGER, // Kaç adet hisse el değiştirdi
    allowNull: false
  },
  price: {
    type: DataTypes.DECIMAL(10, 2), // Hangi fiyattan işlem yapıldı
    allowNull: false
  },
  total: {
    type: DataTypes.DECIMAL(18, 2), // quantity * price
    allowNull: false
  },
  // Ek bilgiler
  tradeType: {
    type: DataTypes.ENUM('MARKET', 'LIMIT'), // İleride kullanılabilir
    allowNull: false,
    defaultValue: 'LIMIT'
  }
}, {
  tableName: 'trades',
  indexes: [
    { fields: ['buyerId'] },
    { fields: ['sellerId'] },
    { fields: ['marketId'] },
    { fields: ['createdAt'] },
    { fields: ['marketId', 'outcome'] },
    { fields: ['buyerId', 'marketId'] },
    { fields: ['sellerId', 'marketId'] }
  ]
});

module.exports = Trade;