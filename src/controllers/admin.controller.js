// src/controllers/admin.controller.js
const marketService = require('../services/market.service');
const userService = require('../services/user.service');
const shareService = require('../services/share.service');
const adminService = require('../services/admin.service');
const { generateUniqueContractCode } = require('../utils/contract-code.util');
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

      console.log('📥 Received market data:', {
        title,
        description,
        category,
        closing_date,
        image_url,
        market_type,
        options
      });

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

      // Generate contract code
      const contractCode = await generateUniqueContractCode({
        title,
        category: category || 'other',
        closing_date
      }, Market);

      const marketData = {
        title,
        description,
        category,
        closing_date,
        image_url,
        market_type: marketTypeValue,
        contract_code: contractCode,
        status: 'open'
      };

      console.log('💾 Creating market with data:', marketData);

      const market = await Market.create(marketData, { transaction });

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

  // Kullanıcının admin yetkisini kaldırma
  async demoteFromAdmin(req, res) {
    try {
      const { id } = req.params;
      
      const user = await User.findByPk(id);
      
      if (!user) {
        return res.status(404).json({ 
          message: 'Kullanıcı bulunamadı' 
        });
      }

      if (user.role !== 'admin') {
        return res.status(400).json({ 
          message: 'Kullanıcı zaten admin değil' 
        });
      }

      await user.update({ role: 'user' });
      
      res.status(200).json({ 
        message: 'Kullanıcının admin yetkisi kaldırıldı.', 
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Admin yetkisi kaldırma hatası:', error);
      res.status(400).json({ 
        message: 'Admin yetkisi kaldırılırken bir hata oluştu.', 
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

  // ========== DASHBOARD ==========

  async getDashboard(req, res) {
    try {
      const stats = await adminService.getDashboardStats();
      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Dashboard hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Dashboard verileri alınamadı',
        error: error.message
      });
    }
  }

  async getRecentActivity(req, res) {
    try {
      const { limit = 50 } = req.query;
      const activities = await adminService.getRecentActivity(parseInt(limit));
      res.status(200).json({
        success: true,
        data: activities
      });
    } catch (error) {
      console.error('Recent activity hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Aktiviteler alınamadı',
        error: error.message
      });
    }
  }

  // ========== USER MANAGEMENT ==========

  async getUserDetails(req, res) {
    try {
      const { id } = req.params;
      const data = await adminService.getUserDetails(id);
      res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      console.error('User details hatası:', error);
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async banUser(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const adminId = req.user.id;

      const user = await adminService.banUser(id, reason, adminId);
      res.status(200).json({
        success: true,
        message: 'Kullanıcı banlandı',
        data: user
      });
    } catch (error) {
      console.error('Ban user hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async unbanUser(req, res) {
    try {
      const { id } = req.params;
      const user = await adminService.unbanUser(id);
      res.status(200).json({
        success: true,
        message: 'Kullanıcının banı kaldırıldı',
        data: user
      });
    } catch (error) {
      console.error('Unban user hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getUserActivity(req, res) {
    try {
      const { id } = req.params;
      const { limit = 50 } = req.query;
      const activities = await adminService.getUserActivity(id, parseInt(limit));
      res.status(200).json({
        success: true,
        data: activities
      });
    } catch (error) {
      console.error('User activity hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ========== CONTRACTS MANAGEMENT ==========

  async getAllContracts(req, res) {
    try {
      const { status } = req.query;
      const contracts = await adminService.getAllContracts({ status });
      res.status(200).json({
        success: true,
        count: contracts.length,
        data: contracts
      });
    } catch (error) {
      console.error('Get contracts hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Kontratlar alınamadı',
        error: error.message
      });
    }
  }

  async getContractDetails(req, res) {
    try {
      const { id } = req.params;
      const contract = await adminService.getContractDetails(id);
      res.status(200).json({
        success: true,
        data: contract
      });
    } catch (error) {
      console.error('Contract details hatası:', error);
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async approveContract(req, res) {
    try {
      const { id } = req.params;
      const adminId = req.user.id;
      const contract = await adminService.approveContract(id, adminId);
      res.status(200).json({
        success: true,
        message: 'Kontrat onaylandı',
        data: contract
      });
    } catch (error) {
      console.error('Approve contract hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async rejectContract(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const adminId = req.user.id;
      const contract = await adminService.rejectContract(id, adminId, reason);
      res.status(200).json({
        success: true,
        message: 'Kontrat reddedildi',
        data: contract
      });
    } catch (error) {
      console.error('Reject contract hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async publishContract(req, res) {
    try {
      const { id } = req.params;
      const adminId = req.user.id;
      const contract = await adminService.publishContract(id, adminId);
      res.status(200).json({
        success: true,
        message: 'Kontrat yayınlandı',
        data: contract
      });
    } catch (error) {
      console.error('Publish contract hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ========== ANALYTICS ==========

  async getUserGrowthAnalytics(req, res) {
    try {
      const { days = 30 } = req.query;
      const data = await adminService.getUserGrowthAnalytics(parseInt(days));
      res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      console.error('User growth analytics hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Analytics alınamadı',
        error: error.message
      });
    }
  }

  async getVolumeAnalytics(req, res) {
    try {
      const { days = 30 } = req.query;
      const data = await adminService.getVolumeAnalytics(parseInt(days));
      res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Volume analytics hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Analytics alınamadı',
        error: error.message
      });
    }
  }

  async getMarketAnalytics(req, res) {
    try {
      const data = await adminService.getMarketAnalytics();
      res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Market analytics hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Analytics alınamadı',
        error: error.message
      });
    }
  }

  // ========== ORDERS MANAGEMENT ==========

  async getAllOrders(req, res) {
    try {
      const { status, marketId, userId, order_type, limit = 100, offset = 0 } = req.query;
      const result = await adminService.getAllOrders({
        status,
        marketId,
        userId,
        order_type,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      res.status(200).json({
        success: true,
        count: result.count,
        data: result.orders
      });
    } catch (error) {
      console.error('Get all orders hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Emirler alınamadı',
        error: error.message
      });
    }
  }

  async cancelOrderAdmin(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const adminId = req.user.id;
      const order = await adminService.cancelOrderAdmin(id, adminId, reason);
      res.status(200).json({
        success: true,
        message: 'Emir iptal edildi',
        data: order
      });
    } catch (error) {
      console.error('Cancel order hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new AdminController();