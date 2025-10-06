// src/services/market.service.js
const { Op } = require('sequelize');
const db = require('../models');
const { Market, Share, User, Transaction, sequelize } = db;

class MarketService {
  // Tüm pazarları (veya filtrelenmiş olanları) bulur
  async findAll(queryOptions = {}) {
    // İleride filtreleme için (örn: sadece 'open' olanları getir)
    const markets = await Market.findAll({ where: queryOptions });
    return markets;
  }

  // Tek bir pazarı ID'sine göre bulur
  async findById(marketId) {
    const market = await Market.findByPk(marketId);
    if (!market) {
      throw new Error('Pazar bulunamadı.');
    }
    return market;
  }
  async create(marketData) {
    const { title, description, closing_date } = marketData;

    if (!title || !closing_date) {
      throw new Error('Başlık ve kapanış tarihi zorunludur.');
    }

    const newMarket = await Market.create({
      title,
      description,
      closing_date
    });

    return newMarket;
  }
  async resolveMarket(marketId, finalOutcome) {
    const t = await sequelize.transaction();
    try {
      // 1. Pazarı bul ve durumunu 'resolved' olarak güncelle
      const market = await Market.findByPk(marketId, { lock: t.LOCK.UPDATE, transaction: t });
      if (!market) throw new Error('Pazar bulunamadı.');
      if (market.status === 'resolved') throw new Error('Bu pazar zaten sonuçlandırılmış.');

      market.status = 'resolved';
      market.outcome = finalOutcome;
      await market.save({ transaction: t });

      // 2. Bu pazardaki tüm hisseleri bul
      const shares = await Share.findAll({ where: { marketId }, transaction: t });
      if (shares.length === 0) {
        // Hiç hisse yoksa, işlemi bitir.
        await t.commit();
        return { message: 'Pazarda hiç hisse olmadığı için işlem yapılmadı.' };
      }

      // 3. Kazanan hisseleri bul ve ödemeleri yap
      const payoutPromises = shares.map(async (share) => {
        // Eğer hissenin sonucu (outcome), pazarın nihai sonucuyla eşleşiyorsa, bu kazanan bir hissedir.
        if (share.outcome === finalOutcome) {
          const winner = await User.findByPk(share.userId, { lock: t.LOCK.UPDATE, transaction: t });
          if (winner) {
            // Her kazanan hisse 1 TL değerindedir.
            const payoutAmount = share.quantity * 1.00;
            winner.balance = parseFloat(winner.balance) + payoutAmount;
            await winner.save({ transaction: t });

            // Ödeme işlemini transaction olarak kaydet
            await Transaction.create({
              userId: winner.id,
              marketId: market.id,
              type: 'payout',
              amount: payoutAmount, // Kazanç olduğu için pozitif
              description: `Pazar "${market.title}" sonucundan kazanılan ödeme.`
            }, { transaction: t });
          }
        }
      });

      // Tüm ödeme işlemlerinin bitmesini bekle
      await Promise.all(payoutPromises);

      await t.commit();
      return { resolvedMarket: market };

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}

module.exports = new MarketService();