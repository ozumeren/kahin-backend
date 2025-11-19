// src/utils/scoring-algorithm.js

/**
 * Normalize volume to 0-100 scale
 */
function normalizeVolume(volume, maxVolume = 1000000) {
  if (!volume || volume <= 0) return 0;
  return Math.min(100, (volume / maxVolume) * 100);
}

/**
 * Normalize traders count to 0-100 scale
 */
function normalizeTraders(tradersCount, maxTraders = 1000) {
  if (!tradersCount || tradersCount <= 0) return 0;
  return Math.min(100, (tradersCount / maxTraders) * 100);
}

/**
 * Calculate recency score based on creation date
 * More recent = higher score
 */
function calculateRecency(createdAt, maxDays = 30) {
  if (!createdAt) return 0;

  const now = new Date();
  const created = new Date(createdAt);
  const daysDiff = (now - created) / (1000 * 60 * 60 * 24);

  if (daysDiff > maxDays) return 0;
  return ((maxDays - daysDiff) / maxDays) * 100;
}

/**
 * Calculate liquidity score based on order book depth
 */
function calculateLiquidity(market) {
  if (!market.orderBook) return 50; // Default score

  const yesBidDepth = market.orderBook?.yes?.depth?.bidDepth || 0;
  const yesAskDepth = market.orderBook?.yes?.depth?.askDepth || 0;
  const noBidDepth = market.orderBook?.no?.depth?.bidDepth || 0;
  const noAskDepth = market.orderBook?.no?.depth?.askDepth || 0;

  const totalDepth = yesBidDepth + yesAskDepth + noBidDepth + noAskDepth;
  return Math.min(100, totalDepth / 10); // Normalize to 0-100
}

/**
 * Calculate featured score for market ranking
 * @param {Object} market - Market object with stats
 * @returns {number} Featured score 0-100
 */
function calculateFeaturedScore(market) {
  const volume = parseFloat(market.volume || 0);
  const tradersCount = parseInt(market.tradersCount || 0);
  const createdAt = market.createdAt;
  const featuredWeight = parseInt(market.featured_weight || 0);

  const volumeScore = normalizeVolume(volume) * 0.35;
  const tradersScore = normalizeTraders(tradersCount) * 0.25;
  const recencyScore = calculateRecency(createdAt) * 0.20;
  const liquidityScore = calculateLiquidity(market) * 0.15;
  const adminWeight = Math.min(100, featuredWeight) * 0.05;

  return volumeScore + tradersScore + recencyScore + liquidityScore + adminWeight;
}

/**
 * Calculate volume velocity indicator
 */
function getVolumeVelocity(changePercent) {
  if (changePercent >= 100) return 'very_high';
  if (changePercent >= 50) return 'high';
  if (changePercent >= 20) return 'moderate';
  return 'low';
}

/**
 * Calculate price movement indicator
 */
function getPriceMovement(priceChange) {
  if (priceChange >= 5) return 'bullish';
  if (priceChange <= -5) return 'bearish';
  return 'stable';
}

/**
 * Determine featured reason based on market stats
 */
function getFeaturedReason(market) {
  if (market.featured && market.featured_weight > 0) return 'admin_featured';

  const volume = parseFloat(market.volume || 0);
  const tradersCount = parseInt(market.tradersCount || 0);
  const createdAt = new Date(market.createdAt);
  const daysSinceCreation = (new Date() - createdAt) / (1000 * 60 * 60 * 24);

  if (volume > 100000) return 'high_volume';
  if (tradersCount > 100) return 'high_activity';
  if (daysSinceCreation < 7 && volume > 10000) return 'trending';
  if (daysSinceCreation < 3) return 'recent_creation';

  return 'popular';
}

module.exports = {
  normalizeVolume,
  normalizeTraders,
  calculateRecency,
  calculateLiquidity,
  calculateFeaturedScore,
  getVolumeVelocity,
  getPriceMovement,
  getFeaturedReason
};
