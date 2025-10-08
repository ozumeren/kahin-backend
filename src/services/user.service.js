// src/services/user.service.js
const { User, Share, Market } = require('../models');
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
}

module.exports = new UserService();