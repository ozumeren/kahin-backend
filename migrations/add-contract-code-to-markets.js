// migrations/add-contract-code-to-markets.js
const { DataTypes } = require('sequelize');

module.exports = {
  async up(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    console.log('🚀 Adding contract_code to markets table...');

    const tableDescription = await queryInterface.describeTable('markets');

    // Add contract_code column if not exists
    if (!tableDescription.contract_code) {
      console.log('➕ Adding contract_code column...');
      await queryInterface.addColumn('markets', 'contract_code', {
        type: DataTypes.STRING(50),
        unique: true,
        allowNull: true // Allow null for existing markets, will be generated
      });

      // Add index for contract_code
      try {
        await queryInterface.addIndex('markets', ['contract_code'], {
          name: 'idx_markets_contract_code',
          unique: true
        });
        console.log('✅ Index created for contract_code');
      } catch (error) {
        console.log('Index may already exist');
      }

      // Generate contract codes for existing markets
      console.log('🔄 Generating contract codes for existing markets...');
      const [markets] = await sequelize.query(
        `SELECT id, title, category, closing_date FROM markets WHERE contract_code IS NULL`
      );

      for (const market of markets) {
        const code = generateContractCode(market);
        await sequelize.query(
          `UPDATE markets SET contract_code = :code WHERE id = :id`,
          { replacements: { code, id: market.id } }
        );
        console.log(`  ✅ Generated code: ${code}`);
      }
    } else {
      console.log('ℹ️ contract_code column already exists');
    }

    console.log('✅ Migration complete!');
  },

  async down(sequelize) {
    const queryInterface = sequelize.getQueryInterface();

    try {
      await queryInterface.removeIndex('markets', 'idx_markets_contract_code');
    } catch (error) {
      console.log('Index removal failed');
    }

    await queryInterface.removeColumn('markets', 'contract_code');
  }
};

// Helper function to generate contract code
function generateContractCode(market) {
  const categoryPrefixes = {
    'politics': 'POL',
    'sports': 'SPT',
    'crypto': 'CRY',
    'economy': 'ECO',
    'entertainment': 'ENT',
    'technology': 'TEC',
    'science': 'SCI',
    'health': 'HLT',
    'environment': 'ENV',
    'other': 'OTH'
  };

  const prefix = categoryPrefixes[market.category] || 'MKT';

  // Create slug from title (first 3 significant words)
  const titleSlug = market.title
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 3)
    .join('-')
    .substring(0, 20);

  // Get expiry date
  const date = new Date(market.closing_date);
  const month = date.toLocaleString('en', { month: 'short' }).toUpperCase();
  const year = date.getFullYear().toString().slice(-2);

  return `${prefix}-${titleSlug}-${month}${year}`;
}
