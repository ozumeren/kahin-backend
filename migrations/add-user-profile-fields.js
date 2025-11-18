// migrations/add-user-profile-fields.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // avatar_url kolonu kontrolü
      const [avatarUrlColumn] = await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name='users' AND column_name='avatar_url';`,
        { transaction }
      );
      
      if (avatarUrlColumn.length === 0) {
        await queryInterface.addColumn('users', 'avatar_url', {
          type: Sequelize.STRING(500),
          allowNull: true,
          defaultValue: null
        }, { transaction });
        console.log('✅ avatar_url kolonu eklendi');
      } else {
        console.log('ℹ️ avatar_url kolonu zaten mevcut');
      }

      // bio kolonu kontrolü
      const [bioColumn] = await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name='users' AND column_name='bio';`,
        { transaction }
      );
      
      if (bioColumn.length === 0) {
        await queryInterface.addColumn('users', 'bio', {
          type: Sequelize.TEXT,
          allowNull: true,
          defaultValue: null
        }, { transaction });
        console.log('✅ bio kolonu eklendi');
      } else {
        console.log('ℹ️ bio kolonu zaten mevcut');
      }

      await transaction.commit();
      console.log('✅ User profile fields migration completed!');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.removeColumn('users', 'avatar_url', { transaction });
      await queryInterface.removeColumn('users', 'bio', { transaction });

      await transaction.commit();
      console.log('✅ Rollback completed!');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};