// src/controllers/admin.controller.js
const marketService = require('../services/market.service');
const userService = require('../services/user.service');
const shareService = require('../services/share.service');
const db = require('../models');
const { Market, MarketOption, User } = db;

class AdminController {
  // Pazar sonuçlandırma
  async resolveMarket(req, res) {
    try {
      const { id } = req.params;
      const { outcome } = req.body;

      if (outcome === null || outcome === undefined) {
        return res.status(400).json({ 
          message: 'Sonuç (outcome) belirtilmelidir. true (Evet) veya false (Hayır) olmalıdır.' 
        });
      }

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

  // Pazar kapatma
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

  // ✨ YENİ - Market Güncelleme
  async updateMarket(req, res) {
    try {
      const { id } = req.params;
      const { title, description, closing_date, image_url, category } = req.body;

      const market = await Market.findByPk(id);
      
      if (!market) {
        return res.status(404).json({ 
          success: false,
          message: 'Market bulunamadı' 
        });
      }

      // Sonuçlandırılmış marketler güncellenemez
      if (market.status === 'resolved') {
        return res.status(400).json({ 
          success: false,
          message: 'Sonuçlandırılmış marketler güncellenemez' 
        });
      }

      // Güncelleme yapılacak alanlar
      const updateData = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (closing_date !== undefined) updateData.closing_date = closing_date;
      if (image_url !== undefined) updateData.image_url = image_url;
      if (category !== undefined) updateData.category = category;

      await market.update(updateData);

      res.status(200).json({ 
        success: true,
        message: 'Market başarıyla güncellendi',
        market 
      });
    } catch (error) {
      console.error('Market güncelleme hatası:', error);
      res.status(400).json({ 
        success: false,
        message: 'Market güncellenirken bir hata oluştu', 
        error: error.message 
      });
    }
  }

  // ✨ YENİ - Market Silme
  async deleteMarket(req, res) {
    const transaction = await db.sequelize.transaction();
    
    try {
      const { id } = req.params;

      const market = await Market.findByPk(id, {
        include: [{
          model: MarketOption,
          as: 'options'
        }],
        transaction
      });
      
      if (!market) {
        await transaction.rollback();
        return res.status(404).json({ 
          success: false,
          message: 'Market bulunamadı' 
        });
      }

      // Sonuçlandırılmış marketler silinemez (isteğe bağlı kısıtlama)
      if (market.status === 'resolved') {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false,
          message: 'Sonuçlandırılmış marketler silinemez' 
        });
      }

      // Önce market seçeneklerini sil (eğer varsa)
      if (market.options && market.options.length > 0) {
        await MarketOption.destroy({
          where: { market_id: id },
          transaction
        });
      }

      // Marketi sil
      await market.destroy({ transaction });

      await transaction.commit();

      res.status(200).json({ 
        success: true,
        message: 'Market başarıyla silindi'
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Market silme hatası:', error);
      res.status(500).json({ 
        success: false,
        message: 'Market silinirken bir hata oluştu', 
        error: error.message 
      });
    }
  }

  // Yeni pazar oluşturma
  async createMarket(req, res) {
    const transaction = await db.sequelize.transaction();
    
    try {
      const {
        title,
        description,
        category,
        closing_date,
        image_url,
        market_type,
        options
      } = req.body;

      if (!title || !closing_date) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Başlık ve kapanış tarihi zorunludur'
        });
      }

      const marketTypeValue = market_type || 'binary';

      if (marketTypeValue === 'multiple_choice') {
        if (!options || !Array.isArray(options) || options.length < 2) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: 'Multiple choice market için en az 2 seçenek gereklidir'
          });
        }
      }

      const market = await Market.create({
        title,
        description,
        category,
        closing_date,
        image_url,
        market_type: marketTypeValue,
        status: 'open'
      }, { transaction });

      if (marketTypeValue === 'multiple_choice' && options) {
        for (let i = 0; i < options.length; i++) {
          const option = options[i];
          await MarketOption.create({
            market_id: market.id,
            option_text: option.option_text,
            option_image_url: option.option_image_url || null,
            option_order: option.option_order !== undefined ? option.option_order : i
          }, { transaction });
        }
      }

      await transaction.commit();

      const createdMarket = await Market.findByPk(market.id, {
        include: [{
          model: MarketOption,
          as: 'options',
          required: false
        }]
      });

      res.status(201).json({
        success: true,
        message: 'Market başarıyla oluşturuldu',
        market: createdMarket
      });

    } catch (error) {
      await transaction.rollback();
      console.error('Market oluşturma hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Market oluşturulamadı',
        error: error.message
      });
    }
  }

  // Kullanıcıya admin yetkisi verme
  async promoteToAdmin(req, res) {
    try {
      const { id } = req.params;
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

  // Kullanıcıya para ekleme
  async addBalanceToUser(req, res) {
    try {
      const { id } = req.params;
      const { amount, description } = req.body;

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

  // Tüm kullanıcıları listeleme
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

  // Tüm pazarları listeleme
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

  // Kullanıcıya hisse ekleme
  async addSharesToUser(req, res) {
    try {
      const { id } = req.params;
      const { marketId, outcome, quantity } = req.body;

      if (!marketId || outcome === null || outcome === undefined || !quantity || quantity <= 0) {
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