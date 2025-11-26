// migrations/add-enhanced-resolution-fields.js
const { DataTypes } = require('sequelize');

module.exports = {
  async up(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🚀 Adding enhanced resolution fields...');

    const tableDescription = await queryInterface.describeTable('markets');

    // Add resolved_at
    if (!tableDescription.resolved_at) {
      console.log('➕ Adding resolved_at column...');
      await queryInterface.addColumn('markets', 'resolved_at', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }

    // Add resolved_by
    if (!tableDescription.resolved_by) {
      console.log('➕ Adding resolved_by column...');
      await queryInterface.addColumn('markets', 'resolved_by', {
        type: DataTypes.UUID,
        allowNull: true
      });
    }

    // Add resolution_notes
    if (!tableDescription.resolution_notes) {
      console.log('➕ Adding resolution_notes column...');
      await queryInterface.addColumn('markets', 'resolution_notes', {
        type: DataTypes.TEXT,
        allowNull: true
      });
    }

    // Add resolution_evidence
    if (!tableDescription.resolution_evidence) {
      console.log('➕ Adding resolution_evidence column...');
      await queryInterface.addColumn('markets', 'resolution_evidence', {
        type: DataTypes.TEXT,
        allowNull: true
      });
    }

    // Add scheduled_resolution_at
    if (!tableDescription.scheduled_resolution_at) {
      console.log('➕ Adding scheduled_resolution_at column...');
      await queryInterface.addColumn('markets', 'scheduled_resolution_at', {
        type: DataTypes.DATE,
        allowNull: true
      });
    }

    // Add scheduled_resolution_outcome
    if (!tableDescription.scheduled_resolution_outcome) {
      console.log('➕ Adding scheduled_resolution_outcome column...');
      await queryInterface.addColumn('markets', 'scheduled_resolution_outcome', {
        type: DataTypes.BOOLEAN,
        allowNull: true
      });
    }

    // Add scheduled_resolution_notes
    if (!tableDescription.scheduled_resolution_notes) {
      console.log('➕ Adding scheduled_resolution_notes column...');
      await queryInterface.addColumn('markets', 'scheduled_resolution_notes', {
        type: DataTypes.TEXT,
        allowNull: true
      });
    }

    console.log('✅ Enhanced resolution fields migration complete!');
  },

  async down(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    await queryInterface.removeColumn('markets', 'scheduled_resolution_notes');
    await queryInterface.removeColumn('markets', 'scheduled_resolution_outcome');
    await queryInterface.removeColumn('markets', 'scheduled_resolution_at');
    await queryInterface.removeColumn('markets', 'resolution_evidence');
    await queryInterface.removeColumn('markets', 'resolution_notes');
    await queryInterface.removeColumn('markets', 'resolved_by');
    await queryInterface.removeColumn('markets', 'resolved_at');
  }
};
