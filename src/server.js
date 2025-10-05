// src/server.js
console.log('--- SERVER.JS DOSYASI BAŞLADI ---');
const express = require('express');
const { Pool } = require('pg'); // Sequelize yerine doğrudan 'pg' kullanıyoruz

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Kahin Projesi Backend Sunucusu Test Modunda!');
});

async function startServer() {
  try {
    console.log('Veritabanı bağlantısı PG Pool ile deneniyor...');
    
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Coolify'ın iç ağında SSL genellikle gerekmez
      // ssl: { rejectUnauthorized: false } 
    });

    const client = await pool.connect();
    console.log('PG Pool: Veritabanına başarıyla bağlanıldı.');

    console.log('PG Pool: Test sorgusu gönderiliyor (SELECT 1+1)...');
    const result = await client.query('SELECT 1+1 AS result;');
    console.log('PG Pool: Test sorgusu başarılı! Sonuç:', result.rows[0]);
    
    client.release(); // Bağlantıyı havuza geri bırak

    app.listen(PORT, () => {
      console.log(`Sunucu ${PORT} portunda başlatıldı.`);
    });
  } catch (error) {
    console.error('PG Pool: Bağlantı veya sorgu sırasında KRİTİK HATA:', error);
  }
}

startServer();