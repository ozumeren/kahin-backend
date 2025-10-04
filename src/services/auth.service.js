// src/services/auth.service.js
const User = require('../models/user.model');
const bcrypt = require('bcryptjs');

class AuthService {
  async register(userData) {
    const { username, email, password } = userData;

    // 1. E-posta veya kullanıcı adının zaten var olup olmadığını kontrol et
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      // Bu şekilde bir hata fırlatmak, controller'da yakalamamızı sağlar
      throw new Error('Bu e-posta adresi zaten kullanılıyor.');
    }

    // 2. Şifreyi güvenli bir şekilde hash'le
    const hashedPassword = await bcrypt.hash(password, 10); // 10, hash'leme gücüdür

    // 3. Yeni kullanıcıyı veritabanına oluştur
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword // Veritabanına hash'lenmiş şifreyi kaydet
    });

    // Şifreyi cevaptan kaldırarak kullanıcı nesnesini geri dön
    newUser.password = undefined;
    return newUser;
  }
}

module.exports = new AuthService();