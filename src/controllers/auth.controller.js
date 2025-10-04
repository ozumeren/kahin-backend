// src/controllers/auth.controller.js
const authService = require('../services/auth.service');

class AuthController {
  async register(req, res) {
    // ... (mevcut register kodun burada)
    try {
      // ...
    } catch (error) {
      // ...
    }
  }

  // --- YENİ LOGIN FONKSİYONU ---
  async login(req, res) {
    try {
      const { accessToken } = await authService.login(req.body);
      res.status(200).json({
        message: 'Giriş başarılı!',
        accessToken
      });
    } catch (error) {
      // Servisten gelen hatayı yakala
      res.status(401).json({ // 401 Unauthorized (Yetkisiz) status kodu daha uygun
        message: 'Giriş başarısız.',
        error: error.message
      });
    }
  }
  // -----------------------------
}

module.exports = new AuthController();