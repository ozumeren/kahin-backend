// src/controllers/auth.controller.js
const authService = require('../services/auth.service');

class AuthController {
  async register(req, res, next) {
    try {
      const newUser = await authService.register(req.body);
      res.status(201).json({
        success: true,
        message: 'Kullanıcı başarıyla oluşturuldu!',
        user: newUser
      });
    } catch (error) {
      // Hatayı error middleware'e ilet
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      console.log('🔐 Login isteği alındı:', req.body.email); // DEBUG
      
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      
      console.log('✅ Login başarılı:', result.user.username); // DEBUG
      
      res.status(200).json({
        success: true,
        message: 'Giriş başarılı!',
        accessToken: result.accessToken,
        user: result.user
      });
    } catch (error) {
      console.error('❌ Login hatası:', error.message); // DEBUG
      next(error);
    }
  }
}

module.exports = new AuthController();