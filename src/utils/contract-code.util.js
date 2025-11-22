// src/utils/contract-code.util.js

const CATEGORY_PREFIXES = {
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

/**
 * Generate a contract code from market data
 * Format: PREFIX-SLUG-MONYY (e.g., CRY-BTC-100K-DEC25)
 */
function generateContractCode(market) {
  const prefix = CATEGORY_PREFIXES[market.category] || 'MKT';

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

/**
 * Generate a unique contract code (handles collisions)
 */
async function generateUniqueContractCode(market, Market) {
  let baseCode = generateContractCode(market);
  let code = baseCode;
  let counter = 1;

  // Check for existing codes and add suffix if needed
  while (true) {
    const existing = await Market.findOne({ where: { contract_code: code } });
    if (!existing) break;

    code = `${baseCode}-${counter}`;
    counter++;

    if (counter > 100) {
      // Fallback to random suffix
      code = `${baseCode}-${Date.now().toString(36).toUpperCase()}`;
      break;
    }
  }

  return code;
}

/**
 * Parse a contract code into its components
 */
function parseContractCode(code) {
  const parts = code.split('-');
  if (parts.length < 2) return null;

  const prefix = parts[0];
  const expiry = parts[parts.length - 1];
  const slug = parts.slice(1, -1).join('-');

  // Find category from prefix
  const category = Object.entries(CATEGORY_PREFIXES)
    .find(([_, p]) => p === prefix)?.[0] || 'other';

  return {
    prefix,
    category,
    slug,
    expiry
  };
}

module.exports = {
  generateContractCode,
  generateUniqueContractCode,
  parseContractCode,
  CATEGORY_PREFIXES
};
