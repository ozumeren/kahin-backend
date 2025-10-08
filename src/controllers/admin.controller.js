// src/controllers/admin.controller.js
const marketService = require('../services/market.service');
const userService = require('../services/user.service');

class AdminController {
  // Pazar sonuçlandırma
  async resolveMarket(req, res) {
    try {
      const { id } = req.params;
      const { outcome } = req.body;

      // Outcome kontrolü
      if (outcome === null || outcome === undefined) {
        return res.status(400).json({ 
          message: 'Sonuç (outcome) belirtilmelidir. true (Evet) veya false (Hayır) olmalıdır.' 
        });
      }

      // Outcome boolean olmalı
      if (typeof outcome !== 'boolean') {
        return res.status(400).json({ 
          message: 'Sonuç boolean tipinde olmalıdır: true veya false' 
        });
      }

      const result = await marketService.resolveMarket(id, outcome);
      
      res.status(200).json({ 
        message: 'Pazar başarıyla sonuçlandırıldı.', 
        ...result 
      });
    } catch (error) {
      console.error('Pazar sonuçlandırma hatası:', error);
      res.status(400).json({ 
        message: 'Pazar sonuçlandırılırken bir hata oluştu.', 
        error: error.message 
      });
    }
  }

  // Pazar kapatma (bahisleri durdurma)
  async closeMarket(req, res) {
    try {
      const { id } = req.params;
      const market = await marketService.closeMarket(id);
      
      res.status(200).json({ 
        message: 'Pazar başarıyla kapatıldı. Artık yeni bahis alınmayacak.', 
        market 
      });
    } catch (error) {
      console.error('Pazar kapatma hatası:', error);
      res.status(400).json({ 
        message: 'Pazar kapatılırken bir hata oluştu.', 
        error: error.message 
      });
    }
  }

  // Yeni pazar oluşturma (sadece admin)
  async createMarket(req, res) {
    try {
      const newMarket = await marketService.create(req.body);
      
      res.status(201).json({ 
        message: 'Pazar başarıyla oluşturuldu.', 
        market: newMarket 
      });
    } catch (error) {
      console.error('Pazar oluşturma hatası:', error);
      res.status(400).json({ 
        message: 'Pazar oluşturulurken bir hata oluştu.', 
        error: error.message 
      });
    }
  }

  // Kullanıcıya admin yetkisi verme
  async promoteToAdmin(req, res) {
    try {
      const { id } = req.params;
      
      // Kullanıcıyı admin yap
      const updatedUser = await userService.promoteToAdmin(id);
      
      res.status(200).json({ 
        message: 'Kullanıcı başarıyla admin yapıldı.', 
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          role: updatedUser.role
        }
      });
    } catch (error) {
      console.error('Kullanıcı yükseltme hatası:', error);
      res.status(400).json({ 
        message: 'Kullanıcı admin yapılırken bir hata oluştu.', 
        error: error.message 
      });
    }
  }
}

module.exports = new AdminController();