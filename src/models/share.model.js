// src/models/share.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Share = sequelize.define('Share', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  outcome: {
    type: DataTypes.BOOLEAN, // true = 'Evet' hissesi, false = 'Hayır' hissesi
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
  // Not: Bu hissenin hangi kullanıcıya ve hangi pazara ait olduğunu
  // bir sonraki adımda "ilişkiler" (associations) ile belirteceğiz.
}, {
  tableName: 'shares'
});

module.exports = Share;