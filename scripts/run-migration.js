// scripts/run-migration.js
const db = require('../src/models');
const migration = require('../migrations/add-multiple-choice-support');

async function runMigration() {
  try {
    console.log('🚀 Migration başlatılıyor...');
    await migration.up(db.sequelize.queryInterface, db.Sequelize);
    console.log('✅ Migration başarıyla tamamlandı!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration hatası:', error);
    process.exit(1);
  }
}

runMigration();