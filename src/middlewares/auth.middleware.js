// src/middlewares/auth.middleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const ApiError = require('../utils/apiError');

const authMiddleware = async (req, res, next) => {
  try {
    // 1. İstek başlığından (header) token'ı al
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Yetkilendirme başarısız: Token bulunamadı.');
    }

    const token = authHeader.split(' ')[1];

    // 2. Token'ı doğrula ve içindeki kullanıcı ID'sini çöz
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Token'dan gelen ID ile kullanıcıyı veritabanında bul
    const user = await User.findByPk(decoded.id);

    if (!user) {
      throw ApiError.unauthorized('Yetkilendirme başarısız: Kullanıcı bulunamadı.');
    }

    // 4. Kullanıcı bilgisini isteğe (request) ekle
    req.user = user;
    next();
  } catch (error) {
    // JWT hataları ve diğer hatalar errorHandler'a iletilir
    next(error);
  }
};

module.exports = authMiddleware;