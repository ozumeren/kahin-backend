/**
 * CLOB Engine Demo/Test Script
 *
 * CLOB Engine'in temel işlevselliğini test eder.
 */

const { CLOBEngine } = require('../index');

async function runDemo() {
  console.log('='.repeat(60));
  console.log('CLOB Engine Demo');
  console.log('='.repeat(60));

  // Engine'i başlat
  const engine = new CLOBEngine({
    port: 3001,
    wsPort: 3002,
    walPath: './data/wal',
    snapshotPath: './data/snapshots'
  });

  // Event listener'lar
  engine.on('trade', (trade) => {
    console.log('\n[TRADE]', {
      id: trade.id,
      price: trade.price,
      quantity: trade.quantity,
      buyer: trade.buyerId,
      seller: trade.sellerId
    });
  });

  engine.on('orderSequenced', (event) => {
    console.log('[SEQUENCED]', event.orderId, '-> Seq:', event.sequenceNumber);
  });

  engine.on('orderRejected', (event) => {
    console.log('[REJECTED]', event.orderId, '-', event.message);
  });

  try {
    await engine.start();

    console.log('\n--- Test Senaryosu Başlıyor ---\n');

    // Test kullanıcıları için bakiye ayarla
    const user1 = 'user-1';
    const user2 = 'user-2';
    const marketId = 'market-test-1';

    console.log('1. Kullanıcı bakiyelerini ayarlıyorum...');
    engine.riskEngine.setBalance(user1, 1000);
    engine.riskEngine.setBalance(user2, 1000);

    console.log(`   User1 bakiye: ${engine.getUserBalance(user1).available} TL`);
    console.log(`   User2 bakiye: ${engine.getUserBalance(user2).available} TL`);

    // User2'ye satmak için hisse ver
    console.log('\n2. User2\'ye hisse veriyorum...');
    engine.riskEngine.setPosition(user2, marketId, true, 100);
    console.log(`   User2 pozisyonu: ${engine.getUserPositions(user2)[`${marketId}:true`]?.available || 0} hisse`);

    // Test 1: Basit eşleşme
    console.log('\n3. Emirleri gönderiyorum...');

    // User1 alış emri
    const buyResult = await engine.submitOrder({
      userId: user1,
      marketId: marketId,
      type: 'BUY',
      outcome: true,
      quantity: 10,
      price: 0.60
    });
    console.log('   Alış emri:', buyResult.success ? 'Kabul edildi' : 'Reddedildi', buyResult.orderId || '');

    // User2 satış emri (eşleşmeli)
    const sellResult = await engine.submitOrder({
      userId: user2,
      marketId: marketId,
      type: 'SELL',
      outcome: true,
      quantity: 10,
      price: 0.55
    });
    console.log('   Satış emri:', sellResult.success ? 'Kabul edildi' : 'Reddedildi', sellResult.orderId || '');

    // Biraz bekle (async işlemler için)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Bakiyeleri kontrol et
    console.log('\n4. Sonuçları kontrol ediyorum...');
    const user1Balance = engine.getUserBalance(user1);
    const user2Balance = engine.getUserBalance(user2);

    console.log(`   User1 bakiye: ${user1Balance.available.toFixed(2)} TL (${user1Balance.locked.toFixed(2)} kilitli)`);
    console.log(`   User2 bakiye: ${user2Balance.available.toFixed(2)} TL`);

    const user1Positions = engine.getUserPositions(user1);
    const user2Positions = engine.getUserPositions(user2);

    console.log(`   User1 hisse: ${user1Positions[`${marketId}:true`]?.available || 0}`);
    console.log(`   User2 hisse: ${user2Positions[`${marketId}:true`]?.available || 0}`);

    // Order book'u kontrol et
    console.log('\n5. Order book durumu:');
    const orderBook = engine.getOrderBook(marketId, true);
    console.log(`   Best Bid: ${orderBook.bestBid || 'Yok'}`);
    console.log(`   Best Ask: ${orderBook.bestAsk || 'Yok'}`);
    console.log(`   Spread: ${orderBook.spread || 'N/A'}`);
    console.log(`   Trade sayısı: ${orderBook.stats.tradeCount}`);

    // İstatistikler
    console.log('\n6. Engine istatistikleri:');
    const stats = engine.getStats();
    console.log(`   Toplam emir: ${stats.totalOrders}`);
    console.log(`   Toplam trade: ${stats.totalTrades}`);
    console.log(`   Toplam hacim: ${stats.totalVolume.toFixed(2)} TL`);

    // Test 2: Partial fill
    console.log('\n7. Partial fill testi...');

    // Büyük alış emri
    await engine.submitOrder({
      userId: user1,
      marketId: marketId,
      type: 'BUY',
      outcome: true,
      quantity: 50,
      price: 0.70
    });

    // Küçük satış emirleri
    for (let i = 0; i < 3; i++) {
      await engine.submitOrder({
        userId: user2,
        marketId: marketId,
        type: 'SELL',
        outcome: true,
        quantity: 10,
        price: 0.65
      });
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    // Final durumu
    console.log('\n8. Final durum:');
    const finalOrderBook = engine.getOrderBook(marketId, true);
    console.log(`   Bids: ${finalOrderBook.bids.length} seviye`);
    console.log(`   Asks: ${finalOrderBook.asks.length} seviye`);
    console.log(`   Son fiyat: ${finalOrderBook.stats.lastPrice}`);
    console.log(`   Toplam trade: ${finalOrderBook.stats.tradeCount}`);

    // Test 3: Risk kontrolü
    console.log('\n9. Risk kontrolü testi...');

    // Yetersiz bakiye ile emir
    const rejectedOrder = await engine.submitOrder({
      userId: user1,
      marketId: marketId,
      type: 'BUY',
      outcome: true,
      quantity: 100000, // Çok büyük
      price: 0.99
    });
    console.log('   Büyük emir:', rejectedOrder.success ? 'Kabul edildi' : 'Reddedildi - ' + rejectedOrder.message);

    console.log('\n' + '='.repeat(60));
    console.log('Demo tamamlandı!');
    console.log('='.repeat(60));

    // 5 saniye bekle sonra kapat
    console.log('\n5 saniye sonra kapanacak...');
    await new Promise(resolve => setTimeout(resolve, 5000));

  } catch (error) {
    console.error('Demo hatası:', error);
  } finally {
    await engine.stop();
    process.exit(0);
  }
}

// Demo'yu çalıştır
runDemo().catch(console.error);
