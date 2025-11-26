// src/models/index.js
const { Sequelize } = require('sequelize');
const sequelize = require('../../config/database');
const User = require('./user.model');
const Market = require('./market.model');
const Share = require('./share.model');
const Transaction = require('./transaction.model');
const Order = require('./order.model');
const Trade = require('./trade.model'); // ✅ Import ekle
const MarketOption = require('./marketOption.model');
const OptionPosition = require('./optionPosition.model');
const OptionTrade = require('./optionTrade.model');
const MarketContract = require('./marketContract.model');
const ContractResolutionEvidence = require('./contractResolutionEvidence.model');
const ContractAmendment = require('./contractAmendment.model');
const PriceHistory = require('./priceHistory.model');
const RefreshToken = require('./refreshToken.model');
const Conversation = require('./conversation.model');
const ConversationParticipant = require('./conversationParticipant.model');
const Message = require('./message.model');
const Notification = require('./notification.model');
const ResolutionHistory = require('./resolutionHistory.model');
const Dispute = require('./dispute.model');

// User <-> Share
User.hasMany(Share, { foreignKey: 'userId' });
Share.belongsTo(User, { foreignKey: 'userId' });

// Market <-> Share
Market.hasMany(Share, { foreignKey: 'marketId' });
Share.belongsTo(Market, { foreignKey: 'marketId' });

// User <-> Transaction
User.hasMany(Transaction, { foreignKey: 'userId' });
Transaction.belongsTo(User, { foreignKey: 'userId' });

// Market <-> Transaction
Market.hasMany(Transaction, { foreignKey: 'marketId' });
Transaction.belongsTo(Market, { foreignKey: 'marketId' });

// User <-> Order
User.hasMany(Order, { foreignKey: 'userId' });
Order.belongsTo(User, { foreignKey: 'userId' });

// Market <-> Order
Market.hasMany(Order, { foreignKey: 'marketId' });
Order.belongsTo(Market, { foreignKey: 'marketId' });

// ===== Trade İlişkileri =====

// Buyer (Alıcı) ilişkisi
User.hasMany(Trade, { as: 'BuyTrades', foreignKey: 'buyerId' });
Trade.belongsTo(User, { as: 'Buyer', foreignKey: 'buyerId' });

// Seller (Satıcı) ilişkisi
User.hasMany(Trade, { as: 'SellTrades', foreignKey: 'sellerId' });
Trade.belongsTo(User, { as: 'Seller', foreignKey: 'sellerId' });

// Market ilişkisi
Market.hasMany(Trade, { foreignKey: 'marketId' });
Trade.belongsTo(Market, { foreignKey: 'marketId' });

// Order ilişkileri
Order.hasMany(Trade, { as: 'BuyTrades', foreignKey: 'buyOrderId' });
Trade.belongsTo(Order, { as: 'BuyOrder', foreignKey: 'buyOrderId' });

Order.hasMany(Trade, { as: 'SellTrades', foreignKey: 'sellOrderId' });
Trade.belongsTo(Order, { as: 'SellOrder', foreignKey: 'sellOrderId' });

Market.hasMany(MarketOption, { 
  as: 'options', 
  foreignKey: 'market_id' 
});
MarketOption.belongsTo(Market, { 
  as: 'market', 
  foreignKey: 'market_id' 
});

// User <-> OptionPosition
User.hasMany(OptionPosition, { 
  as: 'optionPositions', 
  foreignKey: 'user_id' 
});
OptionPosition.belongsTo(User, { 
  as: 'user', 
  foreignKey: 'user_id' 
});

// MarketOption <-> OptionPosition
MarketOption.hasMany(OptionPosition, { 
  as: 'positions', 
  foreignKey: 'option_id' 
});
OptionPosition.belongsTo(MarketOption, { 
  as: 'option', 
  foreignKey: 'option_id' 
});

// User <-> OptionTrade
User.hasMany(OptionTrade, { 
  as: 'optionTrades', 
  foreignKey: 'user_id' 
});
OptionTrade.belongsTo(User, { 
  as: 'user', 
  foreignKey: 'user_id' 
});

// MarketOption <-> OptionTrade
MarketOption.hasMany(OptionTrade, { 
  as: 'trades', 
  foreignKey: 'option_id' 
});
OptionTrade.belongsTo(MarketOption, {
  as: 'option',
  foreignKey: 'option_id'
});

// ===== Contract İlişkileri =====

// Market <-> MarketContract
Market.hasOne(MarketContract, {
  as: 'contract',
  foreignKey: 'market_id'
});
MarketContract.belongsTo(Market, {
  as: 'market',
  foreignKey: 'market_id'
});

// User <-> MarketContract (creator, reviewer, approver)
User.hasMany(MarketContract, {
  as: 'createdContracts',
  foreignKey: 'created_by'
});
MarketContract.belongsTo(User, {
  as: 'creator',
  foreignKey: 'created_by'
});

User.hasMany(MarketContract, {
  as: 'reviewedContracts',
  foreignKey: 'reviewed_by'
});
MarketContract.belongsTo(User, {
  as: 'reviewer',
  foreignKey: 'reviewed_by'
});

User.hasMany(MarketContract, {
  as: 'approvedContracts',
  foreignKey: 'approved_by'
});
MarketContract.belongsTo(User, {
  as: 'approver',
  foreignKey: 'approved_by'
});

// MarketContract <-> ContractResolutionEvidence
MarketContract.hasMany(ContractResolutionEvidence, {
  as: 'evidence',
  foreignKey: 'contract_id'
});
ContractResolutionEvidence.belongsTo(MarketContract, {
  as: 'contract',
  foreignKey: 'contract_id'
});

// User <-> ContractResolutionEvidence
User.hasMany(ContractResolutionEvidence, {
  as: 'collectedEvidence',
  foreignKey: 'collected_by'
});
ContractResolutionEvidence.belongsTo(User, {
  as: 'collector',
  foreignKey: 'collected_by'
});

// MarketContract <-> ContractAmendment
MarketContract.hasMany(ContractAmendment, {
  as: 'amendments',
  foreignKey: 'contract_id'
});
ContractAmendment.belongsTo(MarketContract, {
  as: 'contract',
  foreignKey: 'contract_id'
});

// User <-> ContractAmendment
User.hasMany(ContractAmendment, {
  as: 'createdAmendments',
  foreignKey: 'created_by'
});
ContractAmendment.belongsTo(User, {
  as: 'creator',
  foreignKey: 'created_by'
});

// Parent-Child Contract Relationship (for amendments)
MarketContract.hasMany(MarketContract, {
  as: 'childContracts',
  foreignKey: 'parent_contract_id'
});
MarketContract.belongsTo(MarketContract, {
  as: 'parentContract',
  foreignKey: 'parent_contract_id'
});

// ===== PriceHistory İlişkileri =====
Market.hasMany(PriceHistory, {
  as: 'priceHistory',
  foreignKey: 'market_id'
});
PriceHistory.belongsTo(Market, {
  as: 'market',
  foreignKey: 'market_id'
});

// ===== RefreshToken İlişkileri =====
User.hasMany(RefreshToken, {
  as: 'refreshTokens',
  foreignKey: 'user_id'
});
RefreshToken.belongsTo(User, {
  as: 'user',
  foreignKey: 'user_id'
});

// ===== Messaging İlişkileri =====

// User <-> Conversation (creator)
User.hasMany(Conversation, {
  as: 'createdConversations',
  foreignKey: 'created_by'
});
Conversation.belongsTo(User, {
  as: 'creator',
  foreignKey: 'created_by'
});

// Conversation <-> ConversationParticipant
Conversation.hasMany(ConversationParticipant, {
  as: 'participants',
  foreignKey: 'conversation_id'
});
Conversation.hasMany(ConversationParticipant, {
  as: 'allParticipants',
  foreignKey: 'conversation_id'
});
ConversationParticipant.belongsTo(Conversation, {
  as: 'conversation',
  foreignKey: 'conversation_id'
});

// User <-> ConversationParticipant
User.hasMany(ConversationParticipant, {
  as: 'conversationParticipants',
  foreignKey: 'user_id'
});
ConversationParticipant.belongsTo(User, {
  as: 'user',
  foreignKey: 'user_id'
});

// Conversation <-> Message
Conversation.hasMany(Message, {
  as: 'messages',
  foreignKey: 'conversation_id'
});
Conversation.hasMany(Message, {
  as: 'lastMessage',
  foreignKey: 'conversation_id'
});
Message.belongsTo(Conversation, {
  as: 'conversation',
  foreignKey: 'conversation_id'
});

// User <-> Message (sender)
User.hasMany(Message, {
  as: 'sentMessages',
  foreignKey: 'sender_id'
});
Message.belongsTo(User, {
  as: 'sender',
  foreignKey: 'sender_id'
});

// Message <-> Message (reply)
Message.hasMany(Message, {
  as: 'replies',
  foreignKey: 'reply_to_id'
});
Message.belongsTo(Message, {
  as: 'replyTo',
  foreignKey: 'reply_to_id'
});

// ===== Notification İlişkileri =====

// User <-> Notification
User.hasMany(Notification, {
  as: 'notifications',
  foreignKey: 'user_id'
});
Notification.belongsTo(User, {
  as: 'user',
  foreignKey: 'user_id'
});

// ===== ResolutionHistory İlişkileri =====

// Market <-> ResolutionHistory
Market.hasMany(ResolutionHistory, {
  as: 'resolutionHistory',
  foreignKey: 'marketId'
});
ResolutionHistory.belongsTo(Market, {
  as: 'market',
  foreignKey: 'marketId'
});

// User <-> ResolutionHistory (resolver)
User.hasMany(ResolutionHistory, {
  as: 'resolvedMarkets',
  foreignKey: 'resolved_by'
});
ResolutionHistory.belongsTo(User, {
  as: 'resolver',
  foreignKey: 'resolved_by'
});

// ===== Dispute İlişkileri =====

// Market <-> Dispute
Market.hasMany(Dispute, {
  as: 'disputes',
  foreignKey: 'marketId'
});
Dispute.belongsTo(Market, {
  as: 'market',
  foreignKey: 'marketId'
});

// User <-> Dispute (disputer)
User.hasMany(Dispute, {
  as: 'disputes',
  foreignKey: 'userId'
});
Dispute.belongsTo(User, {
  as: 'user',
  foreignKey: 'userId'
});

// User <-> Dispute (reviewer)
User.hasMany(Dispute, {
  as: 'reviewedDisputes',
  foreignKey: 'reviewed_by'
});
Dispute.belongsTo(User, {
  as: 'reviewer',
  foreignKey: 'reviewed_by'
});

const db = {
  sequelize,
  Sequelize,
  User,
  Market,
  Share,
  Transaction,
  Order,
  Trade,
  // YENİ modeller
  MarketOption,
  OptionPosition,
  OptionTrade,
  MarketContract,
  ContractResolutionEvidence,
  ContractAmendment,
  PriceHistory,
  RefreshToken,
  // Messaging modelleri
  Conversation,
  ConversationParticipant,
  Message,
  // Notification modeli
  Notification,
  // Resolution & Dispute modelleri
  ResolutionHistory,
  Dispute
};


module.exports = db;