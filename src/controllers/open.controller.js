// src/controllers/option.controller.js
const db = require('../models');
const { MarketOption, OptionPosition, OptionTrade, User, Market } = db;

// Option için alım/satım
exports.tradeOption = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    const { optionId } = req.params;
    const { trade_type, position_type, quantity } = req.body;
    const userId = req.user.id;

    // Validasyon
    if (!['BUY', 'SELL'].includes(trade_type)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Geçersiz trade_type. BUY veya SELL olmalı.'
      });
    }

    if (!['YES', 'NO'].includes(position_type)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Geçersiz position_type. YES veya NO olmalı.'
      });
    }

    if (!quantity || quantity <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Geçersiz miktar'
      });
    }

    // Option kontrolü
    const option = await MarketOption.findByPk(optionId, {
      include: [{
        model: Market,
        as: 'market'
      }],
      transaction
    });

    if (!option) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Seçenek bulunamadı'
      });
    }

    // Market durumu kontrolü
    if (option.market.status !== 'open') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Bu market aktif değil'
      });
    }

    // Kullanıcı bilgisi
    const user = await User.findByPk(userId, { transaction });
    const userBalance = parseFloat(user.balance);

    // Fiyat hesaplama
    const price = position_type === 'YES' 
      ? parseFloat(option.yes_price) 
      : parseFloat(option.no_price);
    const totalCost = (price * quantity) / 100;

    if (trade_type === 'BUY') {
      // ALIŞ İŞLEMİ
      if (userBalance < totalCost) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Yetersiz bakiye'
        });
      }

      // Bakiyeden düş
      await user.decrement('balance', { 
        by: totalCost, 
        transaction 
      });

      // Pozisyon oluştur veya güncelle
      const [position, created] = await OptionPosition.findOrCreate({
        where: {
          user_id: userId,
          option_id: optionId,
          position_type: position_type
        },
        defaults: {
          quantity: quantity,
          average_price: price,
          total_invested: totalCost
        },
        transaction
      });

      if (!created) {
        // Mevcut pozisyonu güncelle
        const newQuantity = position.quantity + quantity;
        const newTotalInvested = parseFloat(position.total_invested) + totalCost;
        const newAvgPrice = (newTotalInvested / newQuantity) * 100;

        await position.update({
          quantity: newQuantity,
          total_invested: newTotalInvested,
          average_price: newAvgPrice
        }, { transaction });
      }

      // Volume güncelle
      if (position_type === 'YES') {
        await option.increment('total_yes_volume', { 
          by: totalCost, 
          transaction 
        });
      } else {
        await option.increment('total_no_volume', { 
          by: totalCost, 
          transaction 
        });
      }

    } else if (trade_type === 'SELL') {
      // SATIŞ İŞLEMİ
      const position = await OptionPosition.findOne({
        where: {
          user_id: userId,
          option_id: optionId,
          position_type: position_type
        },
        transaction
      });

      if (!position || position.quantity < quantity) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Yetersiz pozisyon'
        });
      }

      // Satış geliri
      const saleAmount = totalCost;

      // Bakiyeye ekle
      await user.increment('balance', { 
        by: saleAmount, 
        transaction 
      });

      // Pozisyonu güncelle
      const newQuantity = position.quantity - quantity;
      
      if (newQuantity === 0) {
        await position.destroy({ transaction });
      } else {
        const newTotalInvested = parseFloat(position.total_invested) - 
          (parseFloat(position.average_price) * quantity / 100);
        
        await position.update({
          quantity: newQuantity,
          total_invested: newTotalInvested
        }, { transaction });
      }

      // Volume güncelle
      if (position_type === 'YES') {
        await option.decrement('total_yes_volume', { 
          by: saleAmount, 
          transaction 
        });
      } else {
        await option.decrement('total_no_volume', { 
          by: saleAmount, 
          transaction 
        });
      }
    }

    // Trade kaydı oluştur
    const trade = await OptionTrade.create({
      user_id: userId,
      option_id: optionId,
      trade_type: trade_type,
      position_type: position_type,
      quantity: quantity,
      price: price,
      total_amount: totalCost
    }, { transaction });

    // Fiyatları güncelle
    await updateOptionPrices(option, transaction);

    await transaction.commit();

    res.json({
      success: true,
      message: 'İşlem başarılı',
      trade
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Option trade hatası:', error);
    res.status(500).json({
      success: false,
      message: 'İşlem başarısız',
      error: error.message
    });
  }
};

// Kullanıcının bir marketteki tüm option pozisyonları
exports.getMyMarketOptionPositions = async (req, res) => {
  try {
    const { marketId } = req.params;
    const userId = req.user.id;

    const positions = await OptionPosition.findAll({
      where: { user_id: userId },
      include: [{
        model: MarketOption,
        as: 'option',
        where: { market_id: marketId },
        attributes: [
          'id', 
          'option_text', 
          'option_image_url',
          'yes_price',
          'no_price',
          'probability'
        ]
      }],
      order: [
        [{ model: MarketOption, as: 'option' }, 'option_order', 'ASC']
      ]
    });

    res.json({
      success: true,
      positions
    });

  } catch (error) {
    console.error('Pozisyonları getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Pozisyonlar getirilemedi'
    });
  }
};

// Bir option'daki tüm pozisyonlar (public)
exports.getOptionPositions = async (req, res) => {
  try {
    const { optionId } = req.params;

    const positions = await OptionPosition.findAll({
      where: { option_id: optionId },
      attributes: ['position_type', 'quantity', 'average_price'],
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username']
      }]
    });

    res.json({
      success: true,
      positions
    });

  } catch (error) {
    console.error('Option pozisyonları getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Pozisyonlar getirilemedi'
    });
  }
};

// Yardımcı fonksiyon: Fiyatları güncelle
async function updateOptionPrices(option, transaction) {
  await option.reload({ transaction });
  
  const totalYesVolume = parseFloat(option.total_yes_volume);
  const totalNoVolume = parseFloat(option.total_no_volume);
  const totalVolume = totalYesVolume + totalNoVolume;
  
  let yesPrice = 50;
  let probability = 50;
  
  if (totalVolume > 0) {
    probability = (totalYesVolume / totalVolume) * 100;
    yesPrice = Math.min(99, Math.max(1, probability));
  }
  
  const noPrice = 100 - yesPrice;
  
  await option.update({
    yes_price: yesPrice.toFixed(2),
    no_price: noPrice.toFixed(2),
    probability: probability.toFixed(2)
  }, { transaction });
}