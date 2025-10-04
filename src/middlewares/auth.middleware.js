// src/middlewares/auth.middleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

const authMiddleware = async (req, res, next) => {
  // 1. İstek başlığından (header) token'ı al
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Yetkilendirme başarısız: Token bulunamadı.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 2. Token'ı doğrula ve içindeki kullanıcı ID'sini çöz
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Token'dan gelen ID ile kullanıcıyı veritabanında bul
    const user = await User.findByPk(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'Yetkilendirme başarısız: Kullanıcı bulunamadı.' });
    }

    // 4. Kullanıcı bilgisini isteğe (request) ekle, böylece sonraki adımlar bu bilgiye erişebilir
    req.user = user;
    next(); // Her şey yolundaysa, bir sonraki adıma (controller'a) geç
  } catch (error) {
    return res.status(401).json({ message: 'Yetkilendirme başarısız: Token geçersiz.' });
  }
};

module.exports = authMiddleware;