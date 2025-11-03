// scripts/run-migration.js
const db = require('../src/models');
const path = require('path');

async function runMigration() {
  try {
    // Get migration name from command line argument
    const migrationName = process.argv[2];
    
    if (!migrationName) {
      console.error('❌ Lütfen migration dosyasının adını belirtin:');
      console.log('   npm run migrate <migration-dosyası.js>');
      console.log('   Örnek: npm run migrate add-category-to-markets.js');
      process.exit(1);
    }

    const migrationPath = path.join(__dirname, '../migrations', migrationName);
    console.log(`🚀 Migration başlatılıyor: ${migrationName}`);
    
    const migration = require(migrationPath);
    await migration.up(db.sequelize);
    
    console.log('✅ Migration başarıyla tamamlandı!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration hatası:', error);
    process.exit(1);
  }
}

runMigration();