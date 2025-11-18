// migrations/add-timestamps-to-all-tables.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Timestamp Migration başlıyor...');

      // Tüm tabloları kontrol edip timestamps ekleyeceğiz
      const tables = [
        'users',
        'markets', 
        'shares',
        'transactions',
        'orders',
        'trades'
      ];

      for (const tableName of tables) {
        console.log(`\n📋 ${tableName} tablosu kontrol ediliyor...`);

        // created_at kolonu kontrolü
        const [createdAtColumn] = await queryInterface.sequelize.query(
          `SELECT column_name FROM information_schema.columns 
           WHERE table_name='${tableName}' AND column_name='created_at';`,
          { transaction }
        );
        
        if (createdAtColumn.length === 0) {
          // createdAt (camelCase) var mı kontrol et
          const [camelCreatedAt] = await queryInterface.sequelize.query(
            `SELECT column_name FROM information_schema.columns 
             WHERE table_name='${tableName}' AND column_name='createdAt';`,
            { transaction }
          );

          if (camelCreatedAt.length === 0) {
            // Hiç yok, ekle
            await queryInterface.addColumn(tableName, 'created_at', {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }, { transaction });
            console.log(`  ✅ ${tableName}.created_at eklendi`);
          } else {
            console.log(`  ℹ️ ${tableName}.createdAt zaten mevcut (camelCase)`);
          }
        } else {
          console.log(`  ℹ️ ${tableName}.created_at zaten mevcut`);
        }

        // updated_at kolonu kontrolü
        const [updatedAtColumn] = await queryInterface.sequelize.query(
          `SELECT column_name FROM information_schema.columns 
           WHERE table_name='${tableName}' AND column_name='updated_at';`,
          { transaction }
        );
        
        if (updatedAtColumn.length === 0) {
          // updatedAt (camelCase) var mı kontrol et
          const [camelUpdatedAt] = await queryInterface.sequelize.query(
            `SELECT column_name FROM information_schema.columns 
             WHERE table_name='${tableName}' AND column_name='updatedAt';`,
            { transaction }
          );

          if (camelUpdatedAt.length === 0) {
            // Hiç yok, ekle
            await queryInterface.addColumn(tableName, 'updated_at', {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }, { transaction });
            console.log(`  ✅ ${tableName}.updated_at eklendi`);
          } else {
            console.log(`  ℹ️ ${tableName}.updatedAt zaten mevcut (camelCase)`);
          }
        } else {
          console.log(`  ℹ️ ${tableName}.updated_at zaten mevcut`);
        }
      }

      await transaction.commit();
      console.log('\n✅ Timestamp Migration tamamlandı!');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Timestamp Migration hatası:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      const tables = ['users', 'markets', 'shares', 'transactions', 'orders', 'trades'];

      for (const tableName of tables) {
        try {
          await queryInterface.removeColumn(tableName, 'created_at', { transaction });
          await queryInterface.removeColumn(tableName, 'updated_at', { transaction });
          console.log(`✅ ${tableName} timestamps kaldırıldı`);
        } catch (error) {
          console.log(`ℹ️ ${tableName} timestamps zaten yok`);
        }
      }

      await transaction.commit();
      console.log('✅ Rollback completed!');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};