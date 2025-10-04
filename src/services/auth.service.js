// src/services/auth.service.js
const User = require('../models/user.model');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // <-- YENİ: JWT kütüphanesini ekle

class AuthService {
  async register(userData) {
    // ... (mevcut register kodun burada)
    const { username, email, password } = userData;
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new Error('Bu e-posta adresi zaten kullanılıyor.');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword
    });
    newUser.password = undefined;
    return newUser;
  }

  // --- YENİ LOGIN FONKSİYONU ---
  async login(userData) {
    const { email, password } = userData;

    // 1. Kullanıcıyı e-posta adresine göre bul
    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Kullanıcı bulunamazsa, güvenlik nedeniyle genel bir hata mesajı ver
      throw new Error('E-posta veya şifre hatalı.');
    }

    // 2. Gelen şifre ile veritabanındaki hash'lenmiş şifreyi karşılaştır
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      throw new Error('E-posta veya şifre hatalı.');
    }

    // 3. Şifre doğruysa, bir JWT oluştur
    const accessToken = jwt.sign(
      { id: user.id }, // Token'ın içine ne koymak istediğimiz (payload)
      process.env.JWT_SECRET, // Coolify'da belirlediğimiz gizli anahtar
      { expiresIn: '1d' } // Token'ın geçerlilik süresi (örneğin 1 gün)
    );

    return { accessToken };
  }
  // -----------------------------
}

module.exports = new AuthService();