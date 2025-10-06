// src/controllers/auth.controller.js
const authService = require('../services/auth.service');

class AuthController {
  async register(req, res) {
    // Gelen isteğin body'sini loglayarak verinin ulaştığından emin olalım
    console.log('Register Controller\'a gelen body:', req.body);
    try {
      const newUser = await authService.register(req.body);
      res.status(201).json({
        message: 'Kullanıcı başarıyla oluşturuldu!',
        user: newUser
      });
    } catch (error) {
      // Olası hataları loglayalım
      console.error('Kayıt sırasında hata oluştu:', error.message);
      res.status(400).json({
        message: 'Kayıt sırasında bir hata oluştu.',
        error: error.message
      });
    }
  }
}

module.exports = new AuthController();