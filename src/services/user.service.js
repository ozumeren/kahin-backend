// src/services/user.service.js
const { User, Share, Market, Transaction, Trade, sequelize } = require('../models');
const { Op } = require('sequelize');
const ApiError = require('../utils/apiError');

class UserService {
  // Bir kullanıcıyı, sahip olduğu hisseler ve o hisselerin ait olduğu pazarlarla birlikte getirir
  async findUserWithPortfolio(userId) {
    const user = await User.findByPk(userId, {
      // Güvenlik için şifre alanını hariç tut
      attributes: { exclude: ['password'] },
      // İlişkili verileri dahil et
      include: [
        {
          model: Share,
          required: false, // Bu, hiç hissesi olmayan kullanıcılar için de sonucun dönmesini sağlar
          include: [
            {
              model: Market,
              attributes: ['id', 'title', 'status', 'outcome'] // Pazarın sadece gerekli alanlarını getir
            }
          ]
        }
      ]
    });

    if (!user) {
      throw ApiError.notFound('Kullanıcı bulunamadı');
    }

    return user;
  }

  // ========== YENİ: Profil Güncelleme ==========
  async updateProfile(userId, updateData) {
    const user = await User.findByPk(userId);

    if (!user) {
      throw ApiError.notFound('Kullanıcı bulunamadı');
    }

    // İzin verilen alanlar
    const allowedUpdates = ['username', 'email', 'avatar_url', 'bio'];
    const updates = {};

    allowedUpdates.forEach(field => {
      if (updateData[field] !== undefined) {
        updates[field] = updateData[field];
      }
    });

    // Email değişiyorsa, benzersizlik kontrolü yap
    if (updates.email && updates.email !== user.email) {
      const existingUser = await User.findOne({
        where: { email: updates.email }
      });

      if (existingUser) {
        throw ApiError.badRequest('Bu email adresi zaten kullanılıyor');
      }
    }

    // Username değişiyorsa, benzersizlik kontrolü yap
    if (updates.username && updates.username !== user.username) {
      const existingUser = await User.findOne({
        where: { username: updates.username }
      });

      if (existingUser) {
        throw ApiError.badRequest('Bu kullanıcı adı zaten kullanılıyor');
      }
    }

    await user.update(updates);
    user.password = undefined;

    return user;
  }

  // ========== YENİ: Public Profil ==========
  async getPublicProfile(userId) {
    const user = await User.findByPk(userId, {
      attributes: [
        'id',
        'username',
        'avatar_url',
        'bio',
        'created_at'
      ]
    });

    if (!user) {
      throw ApiError.notFound('Kullanıcı bulunamadı');
    }

    // Kullanıcı istatistiklerini ekle
    const stats = await this.getUserStats(userId);

    return {
      ...user.toJSON(),
      stats
    };
  }

  // ========== YENİ: Kullanıcı İstatistikleri ==========
  async getUserStats(userId) {
    const user = await User.findByPk(userId);

    if (!user) {
      throw ApiError.notFound('Kullanıcı bulunamadı');
    }

    // Toplam işlem sayısı
    const totalTransactions = await Transaction.count({
      where: { userId }
    });

    // Toplam trade sayısı
    const totalTrades = await sequelize.query(`
      SELECT COUNT(DISTINCT t.id) as count
      FROM trades t
      WHERE t."buyerId" = :userId OR t."sellerId" = :userId
    `, {
      replacements: { userId },
      type: sequelize.QueryTypes.SELECT
    });

    // Aktif market sayısı (hissesi olan marketler)
    const activeMarkets = await Share.count({
      where: {
        userId,
        quantity: { [Op.gt]: 0 }
      },
      distinct: true,
      col: 'marketId'
    });

    // Toplam kar/zarar
    const profitLoss = await sequelize.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'win' THEN amount ELSE 0 END), 0) as total_wins,
        COALESCE(SUM(CASE WHEN type = 'loss' THEN amount ELSE 0 END), 0) as total_losses
      FROM transactions
      WHERE "userId" = :userId
    `, {
      replacements: { userId },
      type: sequelize.QueryTypes.SELECT
    });

    const netProfit = parseFloat(profitLoss[0].total_wins) - parseFloat(profitLoss[0].total_losses);

    // Win rate (kazanan marketler / toplam sonuçlanan marketler)
    const winRate = await sequelize.query(`
      SELECT 
        COUNT(*) as total_resolved,
        COUNT(CASE 
          WHEN (m.outcome = true AND s.outcome = true) OR 
               (m.outcome = false AND s.outcome = false) 
          THEN 1 
        END) as wins
      FROM shares s
      INNER JOIN markets m ON s."marketId" = m.id
      WHERE s."userId" = :userId 
        AND m.status = 'resolved'
        AND s.quantity > 0
    `, {
      replacements: { userId },
      type: sequelize.QueryTypes.SELECT
    });

    const totalResolved = parseInt(winRate[0].total_resolved) || 0;
    const wins = parseInt(winRate[0].wins) || 0;
    const winRatePercentage = totalResolved > 0 ? ((wins / totalResolved) * 100).toFixed(2) : 0;

    return {
      balance: parseFloat(user.balance),
      total_transactions: totalTransactions,
      total_trades: parseInt(totalTrades[0].count) || 0,
      active_markets: activeMarkets,
      net_profit: parseFloat(netProfit.toFixed(2)),
      win_rate: parseFloat(winRatePercentage),
      markets_won: wins,
      markets_resolved: totalResolved,
      member_since: user.created_at
    };
  }

  // ========== YENİ: Leaderboard ==========
  async getLeaderboard(limit = 20, timeframe = 'all') {
    let dateFilter = '';
    
    if (timeframe === 'week') {
      dateFilter = `AND t."created_at" >= NOW() - INTERVAL '7 days'`;
    } else if (timeframe === 'month') {
      dateFilter = `AND t."created_at" >= NOW() - INTERVAL '30 days'`;
    }

    const leaderboard = await sequelize.query(`
      WITH user_profits AS (
        SELECT 
          u.id,
          u.username,
          u.avatar_url,
          COALESCE(SUM(CASE WHEN t.type = 'win' THEN t.amount ELSE 0 END), 0) - 
          COALESCE(SUM(CASE WHEN t.type = 'loss' THEN t.amount ELSE 0 END), 0) as net_profit,
          COUNT(DISTINCT CASE WHEN tr."buyerId" = u.id OR tr."sellerId" = u.id THEN tr.id END) as total_trades,
          COUNT(DISTINCT s."marketId") as active_markets
        FROM users u
        LEFT JOIN transactions t ON t."userId" = u.id ${dateFilter}
        LEFT JOIN trades tr ON tr."buyerId" = u.id OR tr."sellerId" = u.id
        LEFT JOIN shares s ON s."userId" = u.id AND s.quantity > 0
        GROUP BY u.id, u.username, u.avatar_url
      )
      SELECT 
        ROW_NUMBER() OVER (ORDER BY net_profit DESC) as rank,
        id,
        username,
        avatar_url,
        net_profit,
        total_trades,
        active_markets
      FROM user_profits
      WHERE net_profit > 0
      ORDER BY net_profit DESC
      LIMIT :limit
    `, {
      replacements: { limit },
      type: sequelize.QueryTypes.SELECT
    });

    return leaderboard;
  }

  // Kullanıcıyı admin yapma
  async promoteToAdmin(userId) {
    const user = await User.findByPk(userId);

    if (!user) {
      throw ApiError.notFound('Kullanıcı bulunamadı');
    }

    if (user.role === 'admin') {
      throw ApiError.badRequest('Bu kullanıcı zaten admin');
    }

    user.role = 'admin';
    await user.save();

    // Şifreyi döndürme
    user.password = undefined;
    return user;
  }

  // Kullanıcıyı normal user yapma (admin yetkisini geri alma)
  async demoteFromAdmin(userId) {
    const user = await User.findByPk(userId);

    if (!user) {
      throw ApiError.notFound('Kullanıcı bulunamadı');
    }

    if (user.role === 'user') {
      throw ApiError.badRequest('Bu kullanıcı zaten normal kullanıcı');
    }

    user.role = 'user';
    await user.save();

    user.password = undefined;
    return user;
  }

  // Kullanıcı ID'sine göre bul
  async findById(userId) {
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      throw ApiError.notFound('Kullanıcı bulunamadı');
    }

    return user;
  }

  // Kullanıcıya bakiye ekleme (admin only)
  async addBalance(userId, amount, description = 'Admin tarafından eklenen bakiye') {
    const t = await sequelize.transaction();

    try {
      const user = await User.findByPk(userId, {
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!user) {
        throw ApiError.notFound('Kullanıcı bulunamadı');
      }

      if (amount <= 0) {
        throw ApiError.badRequest('Miktar 0\'dan büyük olmalıdır');
      }

      // Bakiye ekle
      user.balance = parseFloat(user.balance) + parseFloat(amount);
      await user.save({ transaction: t });

      // Transaction kaydı oluştur
      await Transaction.create({
        userId: user.id,
        type: 'deposit',
        amount: amount,
        description: description
      }, { transaction: t });

      await t.commit();

      user.password = undefined;
      return user;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}

module.exports = new UserService();