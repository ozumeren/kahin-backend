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
  async login(email, password) {
    // 1. Kullanıcıyı e-posta adresine göre bul
    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new Error('E-posta veya şifre hatalı.');
    }

    // 2. Gelen şifre ile veritabanındaki hash'lenmiş şifreyi karşılaştır
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      throw new Error('E-posta veya şifre hatalı.');
    }

    // 3. Şifre doğruysa, bir JWT oluştur
    const accessToken = jwt.sign(
      { id: user.id }, // Token'ın içine kullanıcı ID'sini koy
      process.env.JWT_SECRET, // Coolify'da belirlediğimiz gizli anahtar
      { expiresIn: '1d' } // Token'ın geçerlilik süresi (1 gün)
    );

    return { accessToken };
  }
}

module.exports = new AuthService();