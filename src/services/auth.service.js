// src/services/auth.service.js
const { User } = require('../models');
const bcrypt = require('bcryptjs');

class AuthService {
  async register(userData) {
    const { username, email, password } = userData;

    // 1. E-posta'nın zaten var olup olmadığını kontrol et
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new Error('Bu e-posta adresi zaten kullanılıyor.');
    }

    // 2. Şifreyi güvenli bir şekilde hash'le
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Yeni kullanıcıyı veritabanına oluştur
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword
    });

    // Güvenlik için cevaptan şifreyi kaldır
    newUser.password = undefined;
    return newUser;
  }
}

module.exports = new AuthService();