// src/middlewares/auth.middleware.js
const User = require('../models/user.model');
const ApiError = require('../utils/apiError');
const authService = require('../services/auth.service');

const authMiddleware = async (req, res, next) => {
  try {
    let token = null;

    // 1. Token'ı al (Bearer token veya cookie'den)
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Bearer token varsa onu kullan
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      // Cookie'de token varsa onu kullan
      token = req.cookies.token;
    }

    if (!token) {
      throw ApiError.unauthorized('Yetkilendirme başarısız: Token bulunamadı.');
    }

    // 2. Token'ı doğrula (blacklist ve invalidation kontrolü dahil)
    const decoded = await authService.verifyAccessToken(token);

    // 3. Kullanıcıyı bul
    const user = await User.findByPk(decoded.id);

    if (!user) {
      throw ApiError.unauthorized('Yetkilendirme başarısız: Kullanıcı bulunamadı.');
    }

    // 4. Ban kontrolü
    if (user.banned) {
      throw ApiError.forbidden(`Hesabınız engellenmiştir. Sebep: ${user.ban_reason || 'Belirtilmemiş'}`);
    }

    // 5. Kullanıcı bilgisini ve token'ı request'e ekle
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    // JWT hataları ve diğer hatalar errorHandler'a iletilir
    next(error);
  }
};

module.exports = authMiddleware;
