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
  category: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'politics' // Default kategori
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
  },
  image_url: {
    type: DataTypes.STRING,
    allowNull: true // Görsel opsiyonel
  },
  // Discovery & Filtering fields
  featured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  featured_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  featured_weight: {
    type: DataTypes.INTEGER,
    defaultValue: 0 // Yüksek = öncelikli
  },
  view_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  seo_slug: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  }
}, {
  tableName: 'markets',
  indexes: [
    // Featured markets için
    {
      name: 'idx_markets_featured',
      fields: ['featured', 'featured_weight', 'createdAt']
    },
    // Category filtering için
    {
      name: 'idx_markets_category_status',
      fields: ['category', 'status', 'createdAt']
    },
    // Closing date filtering için
    {
      name: 'idx_markets_closing_date',
      fields: ['closing_date']
    },
    // View count için
    {
      name: 'idx_markets_view_count',
      fields: ['view_count']
    }
  ]
});

module.exports = Market;