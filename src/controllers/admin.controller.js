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
exports.createMarket = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const {
      title,
      description,
      category,
      closing_date,
      image_url,
      market_type,      // 'binary' veya 'multiple_choice'
      options           // multiple_choice için gerekli
    } = req.body;

    // Validasyon
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

    // Market oluştur
    const market = await Market.create({
      title,
      description,
      category,
      closing_date,
      image_url,
      market_type: marketTypeValue,
      status: 'open'
    }, { transaction });

    // Eğer multiple_choice ise, seçenekleri ekle
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

    // Oluşturulan marketi seçenekleriyle birlikte getir
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
};

// Market sonuçlandır (binary ve multiple choice için)
exports.resolveMarket = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { outcome, winning_option_id } = req.body;

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

    if (market.status === 'resolved') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Market zaten sonuçlandırılmış'
      });
    }

    if (market.market_type === 'binary') {
      if (outcome === undefined || outcome === null) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Binary market için outcome (true/false) gereklidir'
        });
      }

      await market.update({
        status: 'resolved',
        outcome: outcome
      }, { transaction });

    } else if (market.market_type === 'multiple_choice') {
      if (!winning_option_id) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Multiple choice market için kazanan seçenek ID\'si gereklidir'
        });
      }

      // Kazanan seçeneğin bu markete ait olduğunu kontrol et
      const winningOption = market.options.find(opt => opt.id === parseInt(winning_option_id));
      
      if (!winningOption) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Geçersiz kazanan seçenek ID\'si'
        });
      }

      await market.update({
        status: 'resolved',
        outcome: winning_option_id // Kazanan option ID'sini outcome'a kaydet
      }, { transaction });
    }

    await transaction.commit();

    res.json({
      success: true,
      message: 'Market başarıyla sonuçlandırıldı',
      market
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Market sonuçlandırma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Market sonuçlandırılamadı',
      error: error.message
    });
  }
};
module.exports = new AdminController();