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
    type: DataTypes.DECIMAL(10, 4), // Hisse başına teklif edilen fiyat (örn: 0.65)
    allowNull: true // Market emirlerinde null olabilir
  },
  status: {
    type: DataTypes.ENUM('OPEN', 'FILLED', 'CANCELLED', 'EXPIRED', 'TRIGGERED'), // Emir durumu
    allowNull: false,
    defaultValue: 'OPEN'
  },
  // ========== NEW FIELDS FOR ADVANCED ORDER TYPES ==========
  order_type: {
    type: DataTypes.ENUM('LIMIT', 'MARKET', 'STOP_LOSS', 'TAKE_PROFIT', 'STOP_LIMIT'),
    allowNull: false,
    defaultValue: 'LIMIT'
  },
  time_in_force: {
    type: DataTypes.ENUM('GTC', 'GTD', 'IOC', 'FOK'),
    // GTC = Good-Til-Cancelled (default)
    // GTD = Good-Til-Date
    // IOC = Immediate-Or-Cancel
    // FOK = Fill-Or-Kill
    allowNull: false,
    defaultValue: 'GTC'
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true // Only for GTD orders
  },
  trigger_price: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true // Only for STOP_LOSS, TAKE_PROFIT, STOP_LIMIT
  },
  triggered_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  filled_quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  average_fill_price: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true
  },
  parent_order_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'orders',
      key: 'id'
    }
  }
}, {
  tableName: 'orders',
  indexes: [
    { fields: ['order_type'], name: 'idx_orders_order_type' },
    { fields: ['expires_at'], name: 'idx_orders_expires_at' },
    { fields: ['trigger_price'], name: 'idx_orders_trigger_price' },
    { fields: ['status', 'order_type'], name: 'idx_orders_status_type' }
  ]
});

// Self-referential relationship for linked orders (OCO)
Order.hasMany(Order, { as: 'linkedOrders', foreignKey: 'parent_order_id' });
Order.belongsTo(Order, { as: 'parentOrder', foreignKey: 'parent_order_id' });

module.exports = Order;