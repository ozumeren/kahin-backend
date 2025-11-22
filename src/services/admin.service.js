// src/services/admin.service.js
const { Op, fn, col, literal } = require('sequelize');
const db = require('../models');
const { User, Market, Order, Trade, Transaction, Share, MarketContract } = db;

class AdminService {
  // ========== DASHBOARD STATS ==========

  async getDashboardStats() {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // User stats
    const totalUsers = await User.count();
    const newUsersToday = await User.count({
      where: { created_at: { [Op.gte]: todayStart } }
    });
    const newUsersWeek = await User.count({
      where: { created_at: { [Op.gte]: weekStart } }
    });
    const adminCount = await User.count({ where: { role: 'admin' } });

    // Market stats
    const marketStats = await Market.findAll({
      attributes: [
        'status',
        [fn('COUNT', col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    const marketsByStatus = {};
    marketStats.forEach(m => {
      marketsByStatus[m.status] = parseInt(m.count);
    });

    const totalMarkets = Object.values(marketsByStatus).reduce((a, b) => a + b, 0);

    // Order stats
    const totalOrders = await Order.count();
    const openOrders = await Order.count({ where: { status: 'OPEN' } });
    const ordersToday = await Order.count({
      where: { createdAt: { [Op.gte]: todayStart } }
    });

    // Trade stats
    const totalTrades = await Trade.count();
    const tradesToday = await Trade.count({
      where: { createdAt: { [Op.gte]: todayStart } }
    });

    // Volume calculation
    const volumeResult = await Trade.findOne({
      attributes: [[fn('SUM', col('total')), 'totalVolume']],
      raw: true
    });
    const totalVolume = parseFloat(volumeResult?.totalVolume || 0);

    const todayVolumeResult = await Trade.findOne({
      attributes: [[fn('SUM', col('total')), 'todayVolume']],
      where: { createdAt: { [Op.gte]: todayStart } },
      raw: true
    });
    const todayVolume = parseFloat(todayVolumeResult?.todayVolume || 0);

    // Balance stats (platform liquidity)
    const balanceResult = await User.findOne({
      attributes: [[fn('SUM', col('balance')), 'totalBalance']],
      raw: true
    });
    const totalUserBalance = parseFloat(balanceResult?.totalBalance || 0);

    // Contract stats
    let contractStats = { total: 0, byStatus: {} };
    try {
      const contracts = await MarketContract.findAll({
        attributes: [
          'status',
          [fn('COUNT', col('id')), 'count']
        ],
        group: ['status'],
        raw: true
      });
      contracts.forEach(c => {
        contractStats.byStatus[c.status] = parseInt(c.count);
      });
      contractStats.total = Object.values(contractStats.byStatus).reduce((a, b) => a + b, 0);
    } catch (e) {
      // MarketContract table might not exist
    }

    return {
      users: {
        total: totalUsers,
        admins: adminCount,
        newToday: newUsersToday,
        newThisWeek: newUsersWeek,
        totalBalance: totalUserBalance.toFixed(2)
      },
      markets: {
        total: totalMarkets,
        open: marketsByStatus.open || 0,
        closed: marketsByStatus.closed || 0,
        resolved: marketsByStatus.resolved || 0
      },
      orders: {
        total: totalOrders,
        open: openOrders,
        today: ordersToday
      },
      trades: {
        total: totalTrades,
        today: tradesToday
      },
      volume: {
        total: totalVolume.toFixed(2),
        today: todayVolume.toFixed(2)
      },
      contracts: contractStats,
      generatedAt: new Date().toISOString()
    };
  }

  // ========== USER MANAGEMENT ==========

  async getUserDetails(userId) {
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      throw new Error('Kullanıcı bulunamadı');
    }

    // Get user's shares
    const shares = await Share.findAll({
      where: { userId },
      include: [{
        model: Market,
        attributes: ['id', 'title', 'status', 'outcome']
      }]
    });

    // Get user's orders
    const orders = await Order.findAll({
      where: { userId },
      limit: 50,
      order: [['createdAt', 'DESC']],
      include: [{
        model: Market,
        attributes: ['id', 'title']
      }]
    });

    // Get user's trades
    const trades = await Trade.findAll({
      where: {
        [Op.or]: [{ buyerId: userId }, { sellerId: userId }]
      },
      limit: 50,
      order: [['createdAt', 'DESC']]
    });

    // Get user's transactions
    const transactions = await Transaction.findAll({
      where: { userId },
      limit: 50,
      order: [['createdAt', 'DESC']]
    });

    // Calculate stats
    const totalTradesCount = await Trade.count({
      where: {
        [Op.or]: [{ buyerId: userId }, { sellerId: userId }]
      }
    });

    const volumeResult = await Trade.findOne({
      attributes: [[fn('SUM', col('total')), 'volume']],
      where: {
        [Op.or]: [{ buyerId: userId }, { sellerId: userId }]
      },
      raw: true
    });

    return {
      user,
      shares,
      recentOrders: orders,
      recentTrades: trades,
      recentTransactions: transactions,
      stats: {
        totalTrades: totalTradesCount,
        totalVolume: parseFloat(volumeResult?.volume || 0).toFixed(2),
        activePositions: shares.filter(s => s.quantity > 0).length
      }
    };
  }

  async banUser(userId, reason, adminId) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('Kullanıcı bulunamadı');
    }

    if (user.role === 'admin') {
      throw new Error('Admin kullanıcılar banlanamaz');
    }

    await user.update({
      banned: true,
      banned_at: new Date(),
      banned_by: adminId,
      ban_reason: reason
    });

    // Cancel all open orders
    await Order.update(
      { status: 'CANCELLED' },
      { where: { userId, status: 'OPEN' } }
    );

    return user;
  }

  async unbanUser(userId) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('Kullanıcı bulunamadı');
    }

    await user.update({
      banned: false,
      banned_at: null,
      banned_by: null,
      ban_reason: null
    });

    return user;
  }

  async getUserActivity(userId, limit = 50) {
    const activities = [];

    // Get orders
    const orders = await Order.findAll({
      where: { userId },
      limit,
      order: [['createdAt', 'DESC']],
      raw: true
    });
    orders.forEach(o => {
      activities.push({
        type: 'order',
        action: o.status === 'OPEN' ? 'created' : o.status.toLowerCase(),
        data: o,
        timestamp: o.createdAt
      });
    });

    // Get trades
    const trades = await Trade.findAll({
      where: {
        [Op.or]: [{ buyerId: userId }, { sellerId: userId }]
      },
      limit,
      order: [['createdAt', 'DESC']],
      raw: true
    });
    trades.forEach(t => {
      activities.push({
        type: 'trade',
        action: t.buyerId === userId ? 'bought' : 'sold',
        data: t,
        timestamp: t.createdAt
      });
    });

    // Get transactions
    const transactions = await Transaction.findAll({
      where: { userId },
      limit,
      order: [['createdAt', 'DESC']],
      raw: true
    });
    transactions.forEach(t => {
      activities.push({
        type: 'transaction',
        action: t.type,
        data: t,
        timestamp: t.createdAt
      });
    });

    // Sort by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return activities.slice(0, limit);
  }

  // ========== CONTRACTS MANAGEMENT ==========

  async getAllContracts(filters = {}) {
    const where = {};

    if (filters.status) {
      where.status = filters.status;
    }

    const contracts = await MarketContract.findAll({
      where,
      order: [['created_at', 'DESC']],
      include: [{
        model: Market,
        as: 'market',
        required: false
      }]
    });

    return contracts;
  }

  async getContractDetails(contractId) {
    const contract = await MarketContract.findByPk(contractId, {
      include: [{
        model: Market,
        as: 'market',
        required: false
      }]
    });

    if (!contract) {
      throw new Error('Kontrat bulunamadı');
    }

    return contract;
  }

  async approveContract(contractId, adminId) {
    const contract = await MarketContract.findByPk(contractId);

    if (!contract) {
      throw new Error('Kontrat bulunamadı');
    }

    if (contract.status !== 'pending_review') {
      throw new Error('Sadece inceleme bekleyen kontratlar onaylanabilir');
    }

    await contract.update({
      status: 'approved',
      approved_by: adminId,
      approved_at: new Date()
    });

    return contract;
  }

  async rejectContract(contractId, adminId, reason) {
    const contract = await MarketContract.findByPk(contractId);

    if (!contract) {
      throw new Error('Kontrat bulunamadı');
    }

    await contract.update({
      status: 'draft',
      reviewed_by: adminId,
      reviewed_at: new Date(),
      legal_notes: reason
    });

    return contract;
  }

  async publishContract(contractId, adminId) {
    const contract = await MarketContract.findByPk(contractId);

    if (!contract) {
      throw new Error('Kontrat bulunamadı');
    }

    if (contract.status !== 'approved') {
      throw new Error('Sadece onaylanmış kontratlar yayınlanabilir');
    }

    await contract.update({
      status: 'active',
      published_at: new Date()
    });

    return contract;
  }

  // ========== ANALYTICS ==========

  async getUserGrowthAnalytics(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await User.findAll({
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', col('id')), 'count']
      ],
      where: {
        created_at: { [Op.gte]: startDate }
      },
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true
    });

    // Fill in missing dates
    const data = [];
    const currentDate = new Date(startDate);
    const today = new Date();

    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const found = results.find(r => r.date === dateStr);
      data.push({
        date: dateStr,
        newUsers: found ? parseInt(found.count) : 0
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Calculate cumulative
    let cumulative = await User.count({
      where: { created_at: { [Op.lt]: startDate } }
    });

    data.forEach(d => {
      cumulative += d.newUsers;
      d.totalUsers = cumulative;
    });

    return data;
  }

  async getVolumeAnalytics(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await Trade.findAll({
      attributes: [
        [fn('DATE', col('createdAt')), 'date'],
        [fn('SUM', col('total')), 'volume'],
        [fn('COUNT', col('id')), 'tradeCount']
      ],
      where: {
        createdAt: { [Op.gte]: startDate }
      },
      group: [fn('DATE', col('createdAt'))],
      order: [[fn('DATE', col('createdAt')), 'ASC']],
      raw: true
    });

    // Fill in missing dates
    const data = [];
    const currentDate = new Date(startDate);
    const today = new Date();

    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const found = results.find(r => r.date === dateStr);
      data.push({
        date: dateStr,
        volume: found ? parseFloat(found.volume).toFixed(2) : '0.00',
        tradeCount: found ? parseInt(found.tradeCount) : 0
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return data;
  }

  async getMarketAnalytics() {
    // Markets by category
    const byCategory = await Market.findAll({
      attributes: [
        'category',
        [fn('COUNT', col('id')), 'count']
      ],
      group: ['category'],
      raw: true
    });

    // Markets by status
    const byStatus = await Market.findAll({
      attributes: [
        'status',
        [fn('COUNT', col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // Top markets by volume
    const topMarkets = await Market.findAll({
      limit: 10,
      include: [{
        model: Trade,
        attributes: []
      }],
      attributes: {
        include: [
          [fn('COALESCE', fn('SUM', col('Trades.total')), 0), 'volume']
        ]
      },
      group: ['Market.id'],
      order: [[literal('volume'), 'DESC']],
      raw: true,
      subQuery: false
    });

    // Resolution outcomes
    const resolutionStats = await Market.findAll({
      attributes: [
        'outcome',
        [fn('COUNT', col('id')), 'count']
      ],
      where: {
        status: 'resolved',
        outcome: { [Op.not]: null }
      },
      group: ['outcome'],
      raw: true
    });

    return {
      byCategory: byCategory.reduce((acc, c) => {
        acc[c.category || 'uncategorized'] = parseInt(c.count);
        return acc;
      }, {}),
      byStatus: byStatus.reduce((acc, s) => {
        acc[s.status] = parseInt(s.count);
        return acc;
      }, {}),
      topMarkets,
      resolutionStats: {
        yes: resolutionStats.find(r => r.outcome === true)?.count || 0,
        no: resolutionStats.find(r => r.outcome === false)?.count || 0
      }
    };
  }

  // ========== ORDERS MANAGEMENT ==========

  async getAllOrders(filters = {}) {
    const where = {};

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.marketId) {
      where.marketId = filters.marketId;
    }
    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.order_type) {
      where.order_type = filters.order_type;
    }

    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      limit: filters.limit || 100,
      offset: filters.offset || 0,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: User,
          attributes: ['id', 'username', 'email']
        },
        {
          model: Market,
          attributes: ['id', 'title', 'status']
        }
      ]
    });

    return { count, orders };
  }

  async cancelOrderAdmin(orderId, adminId, reason) {
    const order = await Order.findByPk(orderId, {
      include: [{ model: User }, { model: Market }]
    });

    if (!order) {
      throw new Error('Emir bulunamadı');
    }

    if (order.status !== 'OPEN') {
      throw new Error('Sadece açık emirler iptal edilebilir');
    }

    // Refund the user if it's a buy order
    if (order.type === 'BUY' && order.price) {
      const refundAmount = parseFloat(order.price) * order.quantity;
      await User.increment('balance', {
        by: refundAmount,
        where: { id: order.userId }
      });

      // Create refund transaction
      await Transaction.create({
        userId: order.userId,
        type: 'REFUND',
        amount: refundAmount,
        description: `Admin tarafından iptal edilen emir iadesi: ${reason || 'Belirtilmedi'}`
      });
    }

    // If it's a sell order, return the shares
    if (order.type === 'SELL') {
      await Share.increment('quantity', {
        by: order.quantity,
        where: {
          userId: order.userId,
          marketId: order.marketId,
          outcome: order.outcome
        }
      });
    }

    await order.update({
      status: 'CANCELLED'
    });

    return order;
  }

  // ========== RECENT ACTIVITY ==========

  async getRecentActivity(limit = 50) {
    const activities = [];

    // Recent trades
    const trades = await Trade.findAll({
      limit: 20,
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'Buyer', attributes: ['username'] },
        { model: User, as: 'Seller', attributes: ['username'] },
        { model: Market, attributes: ['title'] }
      ]
    });

    trades.forEach(t => {
      activities.push({
        type: 'trade',
        message: `${t.Buyer?.username} bought from ${t.Seller?.username}`,
        market: t.Market?.title,
        amount: t.total,
        timestamp: t.createdAt
      });
    });

    // Recent user registrations
    const users = await User.findAll({
      limit: 10,
      order: [['created_at', 'DESC']],
      attributes: ['id', 'username', 'created_at']
    });

    users.forEach(u => {
      activities.push({
        type: 'user_registered',
        message: `New user: ${u.username}`,
        timestamp: u.created_at
      });
    });

    // Recent markets created
    const markets = await Market.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'title', 'createdAt']
    });

    markets.forEach(m => {
      activities.push({
        type: 'market_created',
        message: `New market: ${m.title}`,
        timestamp: m.createdAt
      });
    });

    // Sort and limit
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return activities.slice(0, limit);
  }
}

module.exports = new AdminService();
