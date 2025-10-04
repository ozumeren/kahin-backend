// src/controllers/auth.controller.js
const authService = require('../services/auth.service');

class AuthController {
  async register(req, res) {
    try {
      const newUser = await authService.register(req.body);
      res.status(201).json({
        message: 'Kullanıcı başarıyla oluşturuldu!',
        user: newUser
      });
    } catch (error) {
      res.status(400).json({
        message: 'Kayıt sırasında bir hata oluştu.',
        error: error.message
      });
    }
  }
}

module.exports = new AuthController();