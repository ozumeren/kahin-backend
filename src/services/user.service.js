// src/services/user.service.js
const { User, Share, Market, Transaction, sequelize } = require('../models');
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
      throw new Error('Kullanıcı bulunamadı.');
    }

    return user;
  }

  // Kullanıcıyı admin yapma
  async promoteToAdmin(userId) {
    const user = await User.findByPk(userId);

    if (!user) {
      throw new Error('Kullanıcı bulunamadı.');
    }

    if (user.role === 'admin') {
      throw new Error('Bu kullanıcı zaten admin.');
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
      throw new Error('Kullanıcı bulunamadı.');
    }

    if (user.role === 'user') {
      throw new Error('Bu kullanıcı zaten normal kullanıcı.');
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
      throw new Error('Kullanıcı bulunamadı.');
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
        throw new Error('Kullanıcı bulunamadı.');
      }

      // Bakiyeyi artır
      user.balance = parseFloat(user.balance) + parseFloat(amount);
      await user.save({ transaction: t });

      // Transaction kaydı oluştur
      await Transaction.create({
        userId: user.id,
        marketId: null,
        type: 'deposit',
        amount: parseFloat(amount),
        description: description
      }, { transaction: t });

      await t.commit();

      return {
        user: {
          id: user.id,
          username: user.username,
          balance: user.balance
        },
        addedAmount: amount
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // Tüm kullanıcıları listeleme (admin only)
  async getAllUsers({ page = 1, limit = 50, search = '' }) {
    const offset = (page - 1) * limit;
    const where = {};

    // Arama varsa
    if (search) {
      where[Op.or] = [
        { username: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return {
      users: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    };
  }
}

module.exports = new UserService();