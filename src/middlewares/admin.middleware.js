// src/middlewares/admin.middleware.js

const adminMiddleware = async (req, res, next) => {
  try {
    // authMiddleware'den gelen user bilgisini kontrol et
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Yetkilendirme başarısız: Önce giriş yapmalısınız.' 
      });
    }

    // Kullanıcının admin rolüne sahip olup olmadığını kontrol et
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Erişim reddedildi: Bu işlem için admin yetkisi gereklidir.' 
      });
    }

    // Her şey yolundaysa, bir sonraki adıma geç
    next();
  } catch (error) {
    return res.status(500).json({ 
      message: 'Yetki kontrolünde bir hata oluştu.', 
      error: error.message 
    });
  }
};

module.exports = adminMiddleware;