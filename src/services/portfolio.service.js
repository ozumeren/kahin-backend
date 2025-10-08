// src/services/portfolio.service.js
const { User, Share, Market, Transaction } = require('../models');
const { Op } = require('sequelize');
const ApiError = require('../utils/apiError');

class PortfolioService {
  // Kullanıcının tam portföy analizi
  async getPortfolio(userId) {
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      throw ApiError.notFound('Kullanıcı bulunamadı.');
    }

    // Tüm hisseleri çek (sadece açık marketler)
    const shares = await Share.findAll({
      where: { 
        userId,
        quantity: { [Op.gt]: 0 } // Sadece 0'dan büyük hisseler
      },
      include: [
        {
          model: Market,
          where: { status: { [Op.in]: ['open', 'closed'] } }, // Resolved olmayan
          required: true,
          attributes: ['id', 'title', 'status', 'outcome', 'closing_date']
        }
      ]
    });

    // Her pozisyon için detaylı hesaplama
    const positions = [];
    let totalUnrealizedPnL = 0;
    let totalInvested = 0;

    for (const share of shares) {
      const market = share.Market;
      
      // Bu market için kullanıcının toplam yatırımı
      const marketTransactions = await Transaction.findAll({
        where: {
          userId,
          marketId: market.id,
          type: 'bet'
        }
      });

      const invested = marketTransactions.reduce((sum, tx) => {
        return sum + Math.abs(parseFloat(tx.amount));
      }, 0);

      // Mevcut değer (her hisse 1 TL değerinde)
      const currentValue = parseFloat(share.quantity) * 1.00;

      // Gerçekleşmemiş kar/zarar
      const unrealizedPnL = currentValue - invested;
      const pnlPercentage = invested > 0 ? ((unrealizedPnL / invested) * 100).toFixed(2) : '0.00';

      positions.push({
        marketId: market.id,
        marketTitle: market.title,
        marketStatus: market.status,
        outcome: share.outcome ? 'YES' : 'NO',
        quantity: share.quantity,
        invested: invested.toFixed(2),
        currentValue: currentValue.toFixed(2),
        unrealizedPnL: unrealizedPnL.toFixed(2),
        pnlPercentage: `${pnlPercentage}%`,
        closingDate: market.closing_date
      });

      totalUnrealizedPnL += unrealizedPnL;
      totalInvested += invested;
    }

    // Gerçekleşmiş kar/zarar (resolved marketler)
    const realizedStats = await this.getRealizedPnL(userId);

    // Portföy özeti
    const summary = {
      currentBalance: parseFloat(user.balance).toFixed(2),
      totalInvested: totalInvested.toFixed(2),
      totalUnrealizedPnL: totalUnrealizedPnL.toFixed(2),
      totalRealizedPnL: realizedStats.totalRealizedPnL,
      totalPnL: (totalUnrealizedPnL + parseFloat(realizedStats.totalRealizedPnL)).toFixed(2),
      activePositions: positions.length,
      portfolioValue: (parseFloat(user.balance) + totalInvested + totalUnrealizedPnL).toFixed(2)
    };

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      summary,
      positions: positions.sort((a, b) => parseFloat(b.unrealizedPnL) - parseFloat(a.unrealizedPnL))
    };
  }

  // Gerçekleşmiş kar/zarar (resolved marketler)
  async getRealizedPnL(userId) {
    // Tüm resolved marketlerdeki hisseleri bul
    const resolvedShares = await Share.findAll({
      where: { userId },
      include: [
        {
          model: Market,
          where: { status: 'resolved' },
          required: true,
          attributes: ['id', 'title', 'outcome']
        }
      ]
    });

    const realizedPositions = [];
    let totalRealizedPnL = 0;

    for (const share of resolvedShares) {
      const market = share.Market;
      
      // Bu market için yatırım
      const marketTransactions = await Transaction.findAll({
        where: {
          userId,
          marketId: market.id
        }
      });

      let invested = 0;
      let payout = 0;

      marketTransactions.forEach(tx => {
        if (tx.type === 'bet') {
          invested += Math.abs(parseFloat(tx.amount));
        } else if (tx.type === 'payout') {
          payout += parseFloat(tx.amount);
        }
      });

      const realizedPnL = payout - invested;
      const won = share.outcome === market.outcome;

      realizedPositions.push({
        marketId: market.id,
        marketTitle: market.title,
        outcome: share.outcome ? 'YES' : 'NO',
        marketOutcome: market.outcome ? 'YES' : 'NO',
        won,
        invested: invested.toFixed(2),
        payout: payout.toFixed(2),
        realizedPnL: realizedPnL.toFixed(2)
      });

      totalRealizedPnL += realizedPnL;
    }

    return {
      totalRealizedPnL: totalRealizedPnL.toFixed(2),
      positions: realizedPositions.sort((a, b) => parseFloat(b.realizedPnL) - parseFloat(a.realizedPnL))
    };
  }

  // Belirli bir market için pozisyon detayı
  async getMarketPosition(userId, marketId) {
    const market = await Market.findByPk(marketId);
    if (!market) {
      throw ApiError.notFound('Pazar bulunamadı.');
    }

    // Kullanıcının bu marketteki hisseleri
    const shares = await Share.findAll({
      where: { userId, marketId }
    });

    if (shares.length === 0) {
      return {
        message: 'Bu pazarda pozisyonunuz yok.',
        marketId,
        marketTitle: market.title,
        positions: []
      };
    }

    // İşlemler
    const transactions = await Transaction.findAll({
      where: { userId, marketId },
      order: [['createdAt', 'DESC']]
    });

    let totalInvested = 0;
    let totalPayout = 0;

    transactions.forEach(tx => {
      if (tx.type === 'bet') {
        totalInvested += Math.abs(parseFloat(tx.amount));
      } else if (tx.type === 'payout') {
        totalPayout += parseFloat(tx.amount);
      }
    });

    const positions = shares.map(share => {
      const currentValue = parseFloat(share.quantity) * 1.00;
      return {
        outcome: share.outcome ? 'YES' : 'NO',
        quantity: share.quantity,
        currentValue: currentValue.toFixed(2)
      };
    });

    let status;
    let pnl;

    if (market.status === 'resolved') {
      pnl = totalPayout - totalInvested;
      status = 'closed';
    } else {
      const currentValue = shares.reduce((sum, s) => sum + (parseFloat(s.quantity) * 1.00), 0);
      pnl = currentValue - totalInvested;
      status = 'active';
    }

    return {
      marketId: market.id,
      marketTitle: market.title,
      marketStatus: market.status,
      status,
      totalInvested: totalInvested.toFixed(2),
      totalPayout: totalPayout.toFixed(2),
      pnl: pnl.toFixed(2),
      positions,
      transactions: transactions.slice(0, 10) // Son 10 işlem
    };
  }

  // Portföy performans özeti
  async getPerformanceStats(userId) {
    // Tüm transactionları al
    const transactions = await Transaction.findAll({
      where: { userId }
    });

    let totalBets = 0;
    let totalPayouts = 0;
    let totalRefunds = 0;

    transactions.forEach(tx => {
      const amount = parseFloat(tx.amount);
      if (tx.type === 'bet') {
        totalBets += Math.abs(amount);
      } else if (tx.type === 'payout') {
        totalPayouts += amount;
      } else if (tx.type === 'refund') {
        totalRefunds += Math.abs(amount);
      }
    });

    // Kazanılan/kaybedilen market sayısı
    const resolvedShares = await Share.findAll({
      where: { userId },
      include: [
        {
          model: Market,
          where: { status: 'resolved' },
          required: true
        }
      ]
    });

    let wonMarkets = 0;
    let lostMarkets = 0;

    resolvedShares.forEach(share => {
      if (share.outcome === share.Market.outcome) {
        wonMarkets++;
      } else {
        lostMarkets++;
      }
    });

    const totalMarkets = wonMarkets + lostMarkets;
    const winRate = totalMarkets > 0 ? ((wonMarkets / totalMarkets) * 100).toFixed(2) : '0.00';

    const netProfit = totalPayouts - totalBets;
    const roi = totalBets > 0 ? ((netProfit / totalBets) * 100).toFixed(2) : '0.00';

    return {
      totalBets: totalBets.toFixed(2),
      totalPayouts: totalPayouts.toFixed(2),
      totalRefunds: totalRefunds.toFixed(2),
      netProfit: netProfit.toFixed(2),
      roi: `${roi}%`,
      wonMarkets,
      lostMarkets,
      totalMarkets,
      winRate: `${winRate}%`
    };
  }
}

module.exports = new PortfolioService();