// src/services/user.service.js
const { User, Share, Market } = require('../models');

class UserService {
  // Bir kullanıcıyı, sahip olduğu hisseler ve o hisselerin ait olduğu pazarlarla birlikte getirir
  async findUserWithPortfolio(userId) {
    const user = await User.findByPk(userId, {
      // Güvenlik için şifre alanını hariç tut
      attributes: { exclude: ['password'] },
      // İlişkili verileri dahil et
      include: [
        {
          model: Share,
          // Her hissenin ait olduğu pazar bilgisini de getir
          include: [
            {
              model: Market,
              attributes: ['id', 'title', 'status', 'outcome'] // Pazarın sadece gerekli alanlarını getir
            }
          ]
        }
      ]
    });

    if (!user) {
      throw new Error('Kullanıcı bulunamadı.');
    }

    return user;
  }
}

module.exports = new UserService();