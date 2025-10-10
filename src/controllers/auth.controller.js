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
    const { email, password } = req.body;

    const result = await authService.login(email, password);

    // Kullanıcıyı bul
    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw ApiError.unauthorized('Email veya şifre hatalı.');
    }

    // Şifre kontrol
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw ApiError.unauthorized('Email veya şifre hatalı.');
    }

    // JWT token oluştur
    const accessToken = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // ✅ ÖNEMLİ: User bilgisini tam dön (balance dahil)
    res.status(200).json({
      success: true,
      message: 'Giriş başarılı!',
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        balance: user.balance,  // ✅ Balance ekle
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
}
}

module.exports = new AuthController();