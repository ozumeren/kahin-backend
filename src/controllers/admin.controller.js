// src/controllers/admin.controller.js
const marketService = require('../services/market.service');
const userService = require('../services/user.service');
const shareService = require('../services/share.service');

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

  // Kullanıcıya para ekleme (admin only)
  async addBalanceToUser(req, res) {
    try {
      const { id } = req.params;
      const { amount, description } = req.body;

      // Validasyon
      if (!amount || amount <= 0) {
        return res.status(400).json({ 
          message: 'Geçersiz miktar. Pozitif bir değer giriniz.' 
        });
      }

      const result = await userService.addBalance(id, amount, description || 'Admin tarafından eklenen bakiye');
      
      res.status(200).json({ 
        message: `${amount} TL başarıyla eklendi.`,
        data: result
      });
    } catch (error) {
      console.error('Bakiye ekleme hatası:', error);
      res.status(400).json({ 
        message: 'Bakiye eklenirken bir hata oluştu.', 
        error: error.message 
      });
    }
  }

  // Tüm kullanıcıları listeleme (admin only)
  async getAllUsers(req, res) {
    try {
      const { page = 1, limit = 50, search } = req.query;
      const users = await userService.getAllUsers({ page, limit, search });
      
      res.status(200).json({ 
        success: true,
        data: users
      });
    } catch (error) {
      console.error('Kullanıcı listeleme hatası:', error);
      res.status(400).json({ 
        message: 'Kullanıcılar listelenirken bir hata oluştu.', 
        error: error.message 
      });
    }
  }

  // Tüm pazarları listeleme (admin görünümü)
  async getAllMarkets(req, res) {
    try {
      const { status } = req.query;
      const markets = await marketService.findAll(status ? { status } : {});
      
      res.status(200).json({ 
        success: true,
        data: markets
      });
    } catch (error) {
      console.error('Pazar listeleme hatası:', error);
      res.status(400).json({ 
        message: 'Pazarlar listelenirken bir hata oluştu.', 
        error: error.message 
      });
    }
  }

  // Kullanıcıya hisse ekleme (admin only)
  async addSharesToUser(req, res) {
    try {
      const { id } = req.params;
      const { marketId, outcome, quantity } = req.body;

      // Validasyon
      if (!marketId || !outcome || !quantity || quantity <= 0) {
        return res.status(400).json({ 
          message: 'Pazar ID, sonuç (true/false) ve pozitif miktar gereklidir.' 
        });
      }

      if (typeof outcome !== 'boolean') {
        return res.status(400).json({ 
          message: 'Sonuç boolean tipinde olmalıdır (true veya false).' 
        });
      }

      const result = await shareService.addSharesAdmin(id, marketId, outcome, quantity);
      
      res.status(200).json({ 
        message: `${quantity} adet hisse başarıyla eklendi.`,
        data: result
      });
    } catch (error) {
      console.error('Hisse ekleme hatası:', error);
      res.status(400).json({ 
        message: 'Hisse eklenirken bir hata oluştu.', 
        error: error.message 
      });
    }
  }
}

module.exports = new AdminController();