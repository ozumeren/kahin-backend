// src/controllers/admin.controller.js
const marketService = require('../services/market.service');
const userService = require('../services/user.service');
const shareService = require('../services/share.service');
const adminService = require('../services/admin.service');
const marketHealthService = require('../services/marketHealth.service');
const resolutionService = require('../services/resolution.service');
const disputeService = require('../services/dispute.service');
const treasuryService = require('../services/treasury.service');
const userBalanceService = require('../services/userBalance.service');
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

  // ========== MARKET HEALTH MANAGEMENT ==========

  async getMarketHealth(req, res) {
    try {
      const { id } = req.params;
      const health = await marketHealthService.getMarketHealth(id);
      res.status(200).json({
        success: true,
        data: health
      });
    } catch (error) {
      console.error('Market health hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Market health verileri alınamadı',
        error: error.message
      });
    }
  }

  async getLowLiquidityMarkets(req, res) {
    try {
      const { minDepth, maxSpread, minVolume24h, maxTimeSinceLastTrade, limit } = req.query;

      const options = {};
      if (minDepth) options.minDepth = parseInt(minDepth);
      if (maxSpread) options.maxSpread = parseInt(maxSpread);
      if (minVolume24h) options.minVolume24h = parseInt(minVolume24h);
      if (maxTimeSinceLastTrade) options.maxTimeSinceLastTrade = parseInt(maxTimeSinceLastTrade);
      if (limit) options.limit = parseInt(limit);

      const result = await marketHealthService.getLowLiquidityMarkets(options);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Low liquidity markets hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Düşük likidite verileri alınamadı',
        error: error.message
      });
    }
  }

  async pauseMarket(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const adminId = req.user.id;

      const result = await marketHealthService.pauseMarket(id, reason, adminId);
      res.status(200).json({
        success: true,
        message: result.message,
        data: result.market,
        cancelledOrders: result.cancelledOrders
      });
    } catch (error) {
      console.error('Pause market hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async resumeMarket(req, res) {
    try {
      const { id } = req.params;
      const result = await marketHealthService.resumeMarket(id);
      res.status(200).json({
        success: true,
        message: result.message,
        data: result.market
      });
    } catch (error) {
      console.error('Resume market hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getMarketsForAutoClose(req, res) {
    try {
      const { inactiveDays = 7 } = req.query;
      const result = await marketHealthService.getMarketsForAutoClose(parseInt(inactiveDays));
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Markets for auto-close hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Auto-close verileri alınamadı',
        error: error.message
      });
    }
  }

  async getPausedMarkets(req, res) {
    try {
      const result = await marketHealthService.getPausedMarkets();
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Paused markets hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Durdurulmuş marketler alınamadı',
        error: error.message
      });
    }
  }

  // ========== ENHANCED RESOLUTION ==========

  async getResolutionPreview(req, res) {
    try {
      const { id } = req.params;
      const { outcome } = req.query;

      // Convert outcome string to proper type
      let parsedOutcome;
      if (outcome === 'true') parsedOutcome = true;
      else if (outcome === 'false') parsedOutcome = false;
      else if (outcome === 'null') parsedOutcome = null;
      else parsedOutcome = JSON.parse(outcome);

      const preview = await resolutionService.previewResolution(id, parsedOutcome);
      res.status(200).json({
        success: true,
        data: preview
      });
    } catch (error) {
      console.error('Resolution preview hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async resolveMarketEnhanced(req, res) {
    try {
      const { id } = req.params;
      const { outcome, evidence, notes } = req.body;
      const adminId = req.user.id;

      const result = await resolutionService.resolveMarket(id, {
        outcome,
        evidence,
        notes,
        resolvedBy: adminId
      });

      res.status(200).json({
        success: true,
        message: result.message,
        data: result.market
      });
    } catch (error) {
      console.error('Enhanced resolution hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async scheduleResolution(req, res) {
    try {
      const { id } = req.params;
      const { resolveAt, outcome, notes } = req.body;

      const result = await resolutionService.scheduleResolution(id, {
        resolveAt,
        outcome,
        notes
      });

      res.status(200).json({
        success: true,
        message: result.message,
        data: result.market,
        scheduledFor: result.scheduledFor
      });
    } catch (error) {
      console.error('Schedule resolution hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getScheduledResolutions(req, res) {
    try {
      const markets = await resolutionService.getScheduledResolutions();
      res.status(200).json({
        success: true,
        count: markets.length,
        data: markets
      });
    } catch (error) {
      console.error('Get scheduled resolutions hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Zamanlanmış çözümler alınamadı',
        error: error.message
      });
    }
  }

  // ========== RESOLUTION HISTORY ==========

  async getMarketResolutionHistory(req, res) {
    try {
      const { id } = req.params;
      const history = await resolutionService.getMarketResolutionHistory(id);

      res.status(200).json({
        success: true,
        count: history.length,
        data: history
      });
    } catch (error) {
      console.error('Get market resolution history hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Çözüm geçmişi alınamadı',
        error: error.message
      });
    }
  }

  async getAllResolutionHistory(req, res) {
    try {
      const { page, limit, type, resolvedBy } = req.query;

      const result = await resolutionService.getAllResolutionHistory({
        page,
        limit,
        type,
        resolvedBy
      });

      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Get all resolution history hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Çözüm geçmişi alınamadı',
        error: error.message
      });
    }
  }

  // ========== DISPUTE MANAGEMENT ==========

  async createDispute(req, res) {
    try {
      const {
        marketId,
        userId,
        disputeType,
        disputeReason,
        disputeEvidence
      } = req.body;

      const dispute = await disputeService.createDispute({
        marketId,
        userId,
        disputeType,
        disputeReason,
        disputeEvidence
      });

      res.status(201).json({
        success: true,
        message: 'İtiraz başarıyla oluşturuldu',
        data: dispute
      });
    } catch (error) {
      console.error('Create dispute hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getAllDisputes(req, res) {
    try {
      const { page, limit, status, priority, disputeType, marketId } = req.query;

      const result = await disputeService.getAllDisputes({
        page,
        limit,
        status,
        priority,
        disputeType,
        marketId
      });

      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Get all disputes hatası:', error);
      res.status(500).json({
        success: false,
        message: 'İtirazlar alınamadı',
        error: error.message
      });
    }
  }

  async getDisputeById(req, res) {
    try {
      const { id } = req.params;
      const dispute = await disputeService.getDisputeById(id);

      res.status(200).json({
        success: true,
        data: dispute
      });
    } catch (error) {
      console.error('Get dispute hatası:', error);
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async getMarketDisputes(req, res) {
    try {
      const { id } = req.params;
      const disputes = await disputeService.getMarketDisputes(id);

      res.status(200).json({
        success: true,
        count: disputes.length,
        data: disputes
      });
    } catch (error) {
      console.error('Get market disputes hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Market itirazları alınamadı',
        error: error.message
      });
    }
  }

  async updateDisputeStatus(req, res) {
    try {
      const { id } = req.params;
      const {
        status,
        reviewNotes,
        resolutionAction,
        resolutionNotes
      } = req.body;

      const dispute = await disputeService.updateDisputeStatus(id, {
        status,
        reviewedBy: req.user?.id, // From auth middleware
        reviewNotes,
        resolutionAction,
        resolutionNotes
      });

      res.status(200).json({
        success: true,
        message: 'İtiraz durumu güncellendi',
        data: dispute
      });
    } catch (error) {
      console.error('Update dispute status hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateDisputePriority(req, res) {
    try {
      const { id } = req.params;
      const { priority } = req.body;

      const dispute = await disputeService.updateDisputePriority(id, priority);

      res.status(200).json({
        success: true,
        message: 'İtiraz önceliği güncellendi',
        data: dispute
      });
    } catch (error) {
      console.error('Update dispute priority hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async upvoteDispute(req, res) {
    try {
      const { id } = req.params;
      const dispute = await disputeService.upvoteDispute(id);

      res.status(200).json({
        success: true,
        message: 'İtiraz oylandı',
        data: dispute
      });
    } catch (error) {
      console.error('Upvote dispute hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getDisputeStats(req, res) {
    try {
      const stats = await disputeService.getDisputeStats();

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get dispute stats hatası:', error);
      res.status(500).json({
        success: false,
        message: 'İtiraz istatistikleri alınamadı',
        error: error.message
      });
    }
  }

  // ========== TREASURY & FINANCIAL CONTROLS ==========

  async getTreasuryOverview(req, res) {
    try {
      const overview = await treasuryService.getTreasuryOverview();

      res.status(200).json({
        success: true,
        data: overview
      });
    } catch (error) {
      console.error('Get treasury overview hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Treasury overview alınamadı',
        error: error.message
      });
    }
  }

  async getLiquidityStatus(req, res) {
    try {
      const status = await treasuryService.getLiquidityStatus();

      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Get liquidity status hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Liquidity status alınamadı',
        error: error.message
      });
    }
  }

  async getNegativeBalances(req, res) {
    try {
      const users = await treasuryService.getNegativeBalances();

      res.status(200).json({
        success: true,
        count: users.length,
        data: users
      });
    } catch (error) {
      console.error('Get negative balances hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Negative balances alınamadı',
        error: error.message
      });
    }
  }

  async getTopBalanceHolders(req, res) {
    try {
      const { limit = 10 } = req.query;
      const users = await treasuryService.getTopBalanceHolders(limit);

      res.status(200).json({
        success: true,
        count: users.length,
        data: users
      });
    } catch (error) {
      console.error('Get top balance holders hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Top balance holders alınamadı',
        error: error.message
      });
    }
  }

  async runReconciliation(req, res) {
    try {
      const result = await treasuryService.runReconciliation();

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Reconciliation hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Reconciliation çalıştırılamadı',
        error: error.message
      });
    }
  }

  // ========== USER BALANCE MANAGEMENT ==========

  async adjustUserBalance(req, res) {
    try {
      const { id } = req.params;
      const { amount, reason, type } = req.body;

      if (!amount || !reason) {
        return res.status(400).json({
          success: false,
          message: 'Amount ve reason gerekli'
        });
      }

      const result = await userBalanceService.adjustBalance(id, {
        amount: parseFloat(amount),
        reason,
        type,
        adjustedBy: req.user?.id // From auth middleware
      });

      res.status(200).json(result);
    } catch (error) {
      console.error('Adjust balance hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async freezeUserBalance(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Freeze reason gerekli'
        });
      }

      const result = await userBalanceService.freezeBalance(id, {
        reason,
        frozenBy: req.user?.id
      });

      res.status(200).json(result);
    } catch (error) {
      console.error('Freeze balance hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async unfreezeUserBalance(req, res) {
    try {
      const { id } = req.params;

      const result = await userBalanceService.unfreezeBalance(id, {
        unfrozenBy: req.user?.id
      });

      res.status(200).json(result);
    } catch (error) {
      console.error('Unfreeze balance hatası:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getUserBalanceHistory(req, res) {
    try {
      const { id } = req.params;
      const { page, limit } = req.query;

      const history = await userBalanceService.getBalanceHistory(id, {
        page,
        limit
      });

      res.status(200).json({
        success: true,
        ...history
      });
    } catch (error) {
      console.error('Get balance history hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Balance history alınamadı',
        error: error.message
      });
    }
  }

  async getBalanceAdjustmentHistory(req, res) {
    try {
      const { page, limit, userId } = req.query;

      const history = await userBalanceService.getAdjustmentHistory({
        page,
        limit,
        userId
      });

      res.status(200).json({
        success: true,
        ...history
      });
    } catch (error) {
      console.error('Get adjustment history hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Adjustment history alınamadı',
        error: error.message
      });
    }
  }

  // ========== TRANSACTION MONITORING ==========

  async getAllTransactions(req, res) {
    try {
      const { page = 1, limit = 50, type, userId, minAmount, maxAmount, startDate, endDate } = req.query;

      const where = {};

      if (type) where.type = type;
      if (userId) where.userId = userId;
      if (minAmount) {
        where.amount = { [db.sequelize.Sequelize.Op.gte]: parseFloat(minAmount) };
      }
      if (maxAmount) {
        if (where.amount) {
          where.amount[db.sequelize.Sequelize.Op.lte] = parseFloat(maxAmount);
        } else {
          where.amount = { [db.sequelize.Sequelize.Op.lte]: parseFloat(maxAmount) };
        }
      }
      if (startDate) {
        where.createdAt = { [db.sequelize.Sequelize.Op.gte]: new Date(startDate) };
      }
      if (endDate) {
        if (where.createdAt) {
          where.createdAt[db.sequelize.Sequelize.Op.lte] = new Date(endDate);
        } else {
          where.createdAt = { [db.sequelize.Sequelize.Op.lte]: new Date(endDate) };
        }
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);

      const { Transaction, User, Market } = db;
      const { count, rows } = await Transaction.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'email']
          },
          {
            model: Market,
            as: 'market',
            attributes: ['id', 'title'],
            required: false
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset
      });

      res.status(200).json({
        success: true,
        transactions: rows.map(t => ({
          id: t.id,
          userId: t.userId,
          username: t.user?.username,
          email: t.user?.email,
          marketId: t.marketId,
          marketTitle: t.market?.title,
          type: t.type,
          amount: parseFloat(t.amount).toFixed(2),
          description: t.description,
          metadata: t.metadata,
          createdAt: t.createdAt
        })),
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      });
    } catch (error) {
      console.error('Get transactions hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Transactions alınamadı',
        error: error.message
      });
    }
  }

  async getLargeTransactions(req, res) {
    try {
      const { threshold = 10000, limit = 50 } = req.query;

      const { Transaction, User } = db;
      const transactions = await Transaction.findAll({
        where: {
          amount: { [db.sequelize.Sequelize.Op.gte]: parseFloat(threshold) }
        },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'email']
          }
        ],
        order: [['amount', 'DESC']],
        limit: parseInt(limit)
      });

      res.status(200).json({
        success: true,
        count: transactions.length,
        threshold: parseFloat(threshold),
        transactions: transactions.map(t => ({
          id: t.id,
          userId: t.userId,
          username: t.user?.username,
          type: t.type,
          amount: parseFloat(t.amount).toFixed(2),
          description: t.description,
          createdAt: t.createdAt
        }))
      });
    } catch (error) {
      console.error('Get large transactions hatası:', error);
      res.status(500).json({
        success: false,
        message: 'Large transactions alınamadı',
        error: error.message
      });
    }
  }
}

module.exports = new AdminController();