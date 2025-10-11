// src/controllers/market.controller.js
const marketService = require('../services/market.service');
const db = require('../models');
const { Trade } = db;

class MarketController {
  // Tüm pazarları listele (Public)
  async getMarkets(req, res, next) {
    try {
      const filters = {};
      if (req.query.status) {
        filters.status = req.query.status;
      }

      const markets = await marketService.findAll(filters);
      
      // Her market için volume, tradersCount ve prices hesapla
      const marketsWithStats = await Promise.all(
        markets.map(async (market) => {
          const marketData = market.toJSON();
          
          // Volume hesapla (tüm trade'lerin toplamı)
          const trades = await Trade.findAll({
            where: { marketId: market.id },
            attributes: ['total'],
            raw: true
          });
          
          marketData.volume = trades.reduce((sum, trade) => {
            return sum + parseFloat(trade.total || 0);
          }, 0).toFixed(2);
          
          // Unique trader count hesapla
          const uniqueTraders = await Trade.findAll({
            where: { marketId: market.id },
            attributes: ['buyerId', 'sellerId'],
            raw: true
          });
          
          const traderSet = new Set();
          uniqueTraders.forEach(trade => {
            traderSet.add(trade.buyerId);
            traderSet.add(trade.sellerId);
          });
          
          marketData.tradersCount = traderSet.size;
          
          // Order book'tan fiyatları al
          try {
            const orderBook = await marketService.getOrderBook(market.id);
            
            console.log(`📊 Market ${market.id} - Order Book:`, {
              yesMidPrice: orderBook.yes.midPrice,
              yesBestBid: orderBook.yes.bids[0]?.price,
              noMidPrice: orderBook.no.midPrice,
              noBestBid: orderBook.no.bids[0]?.price
            });
            
            // YES fiyatı: best bid veya mid price
            marketData.yesPrice = orderBook.yes.midPrice || 
                                  (orderBook.yes.bids[0]?.price) || 
                                  '50.00';
            
            // NO fiyatı: best bid veya mid price
            marketData.noPrice = orderBook.no.midPrice || 
                                 (orderBook.no.bids[0]?.price) || 
                                 '50.00';
            
            console.log(`📊 Market ${market.id} - Final Prices:`, {
              yesPrice: marketData.yesPrice,
              noPrice: marketData.noPrice
            });
          } catch (error) {
            console.log(`⚠️ Market ${market.id} - No order book, using defaults`);
            // Order book yoksa default değerler
            marketData.yesPrice = '50.00';
            marketData.noPrice = '50.00';
          }
          
          return marketData;
        })
      );

      res.status(200).json({
        success: true,
        count: marketsWithStats.length,
        data: marketsWithStats
      });
    } catch (error) {
      next(error);
    }
  }

  // Tek bir pazarın detayını getir (Public)
  async getMarketById(req, res, next) {
    try {
      const { id } = req.params;
      const market = await marketService.findById(id);
      const marketData = market.toJSON();
      
      // Volume hesapla
      const trades = await Trade.findAll({
        where: { marketId: id },
        attributes: ['total'],
        raw: true
      });
      
      marketData.volume = trades.reduce((sum, trade) => {
        return sum + parseFloat(trade.total || 0);
      }, 0).toFixed(2);
      
      // Unique trader count hesapla
      const uniqueTraders = await Trade.findAll({
        where: { marketId: id },
        attributes: ['buyerId', 'sellerId'],
        raw: true
      });
      
      const traderSet = new Set();
      uniqueTraders.forEach(trade => {
        traderSet.add(trade.buyerId);
        traderSet.add(trade.sellerId);
      });
      
      marketData.tradersCount = traderSet.size;
      
      // Order book'tan fiyatları al
      try {
        const orderBook = await marketService.getOrderBook(id);
        
        // YES fiyatı: best bid veya mid price
        marketData.yesPrice = orderBook.yes.midPrice || 
                              (orderBook.yes.bids[0]?.price) || 
                              '50.00';
        
        // NO fiyatı: best bid veya mid price
        marketData.noPrice = orderBook.no.midPrice || 
                             (orderBook.no.bids[0]?.price) || 
                             '50.00';
      } catch (error) {
        // Order book yoksa default değerler
        marketData.yesPrice = '50.00';
        marketData.noPrice = '50.00';
      }
      
      res.status(200).json({
        success: true,
        data: marketData
      });
    } catch (error) {
      next(error);
    }
  }

  // Order book'u getir (Public) - Kalshi/Polymarket standardı
  async getOrderBook(req, res, next) {
    try {
      const { id } = req.params;
      const orderBook = await marketService.getOrderBook(id);
      res.status(200).json({
        success: true,
        data: orderBook
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MarketController();