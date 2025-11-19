// src/utils/trend-calculator.js

/**
 * Calculate volume change percentage over timeframe
 */
function calculateVolumeChange(currentVolume, previousVolume) {
  if (!previousVolume || previousVolume === 0) {
    return currentVolume > 0 ? 100 : 0;
  }
  return ((currentVolume - previousVolume) / previousVolume) * 100;
}

/**
 * Calculate trader growth percentage
 */
function calculateTraderGrowth(currentTraders, previousTraders) {
  if (!previousTraders || previousTraders === 0) {
    return currentTraders > 0 ? 100 : 0;
  }
  return ((currentTraders - previousTraders) / previousTraders) * 100;
}

/**
 * Calculate price momentum based on price changes
 */
function calculatePriceMomentum(priceHistory) {
  if (!priceHistory || priceHistory.length < 2) return 0;

  // Simple momentum: (latest - oldest) / oldest * 100
  const oldest = priceHistory[0];
  const latest = priceHistory[priceHistory.length - 1];

  if (!oldest || oldest === 0) return 0;
  return ((latest - oldest) / oldest) * 100;
}

/**
 * Calculate engagement rate based on views and trades
 */
function calculateEngagementRate(views, trades) {
  if (!views || views === 0) return 0;
  return (trades / views) * 100;
}

/**
 * Calculate trending score for a market
 * @param {Object} stats - Market statistics
 * @param {string} timeframe - Timeframe: '24h', '7d', '30d'
 * @returns {number} Trending score 0-100+
 */
function calculateTrendingScore(stats, timeframe = '24h') {
  const {
    volumeChange = 0,
    traderGrowth = 0,
    priceMomentum = 0,
    engagementRate = 0
  } = stats;

  // Weights based on importance
  const volumeWeight = 0.40;
  const traderWeight = 0.30;
  const momentumWeight = 0.20;
  const engagementWeight = 0.10;

  // Normalize and cap values
  const normalizedVolume = Math.min(200, Math.max(0, volumeChange));
  const normalizedTraders = Math.min(200, Math.max(0, traderGrowth));
  const normalizedMomentum = Math.min(100, Math.max(-100, priceMomentum));
  const normalizedEngagement = Math.min(100, Math.max(0, engagementRate));

  // Calculate weighted score
  const score = (
    (normalizedVolume * volumeWeight) +
    (normalizedTraders * traderWeight) +
    (Math.abs(normalizedMomentum) * momentumWeight) +
    (normalizedEngagement * engagementWeight)
  );

  return Math.round(score * 10) / 10;
}

/**
 * Get trending indicators
 */
function getTrendingIndicators(stats) {
  const { volumeChange = 0, priceMomentum = 0 } = stats;

  // Volume velocity
  let volumeVelocity = 'low';
  if (volumeChange >= 100) volumeVelocity = 'very_high';
  else if (volumeChange >= 50) volumeVelocity = 'high';
  else if (volumeChange >= 20) volumeVelocity = 'moderate';

  // Price movement
  let priceMovement = 'stable';
  if (priceMomentum >= 5) priceMovement = 'bullish';
  else if (priceMomentum <= -5) priceMovement = 'bearish';

  // Social buzz (placeholder - would need actual social data)
  const socialBuzz = volumeChange >= 50 ? 'high' : volumeChange >= 20 ? 'medium' : 'low';

  return {
    volume_velocity: volumeVelocity,
    price_movement: priceMovement,
    social_buzz: socialBuzz
  };
}

/**
 * Calculate timeframe in hours
 */
function getTimeframeHours(timeframe) {
  switch (timeframe) {
    case '24h': return 24;
    case '7d': return 24 * 7;
    case '30d': return 24 * 30;
    default: return 24;
  }
}

/**
 * Get date range for timeframe
 */
function getTimeframeRange(timeframe) {
  const hours = getTimeframeHours(timeframe);
  const now = new Date();
  const start = new Date(now.getTime() - hours * 60 * 60 * 1000);

  return { start, end: now };
}

/**
 * Calculate 24h change for a numeric value
 */
function calculate24hChange(current, previous24h) {
  if (!previous24h || previous24h === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous24h) / previous24h) * 100 * 10) / 10;
}

/**
 * Aggregate trade data for timeframe
 */
function aggregateTradeData(trades, timeframe) {
  const { start, end } = getTimeframeRange(timeframe);

  const filtered = trades.filter(trade => {
    const tradeDate = new Date(trade.createdAt);
    return tradeDate >= start && tradeDate <= end;
  });

  const volume = filtered.reduce((sum, trade) => sum + parseFloat(trade.total || 0), 0);
  const uniqueTraders = new Set();

  filtered.forEach(trade => {
    if (trade.buyerId) uniqueTraders.add(trade.buyerId);
    if (trade.sellerId) uniqueTraders.add(trade.sellerId);
  });

  return {
    volume,
    tradersCount: uniqueTraders.size,
    tradeCount: filtered.length
  };
}

module.exports = {
  calculateVolumeChange,
  calculateTraderGrowth,
  calculatePriceMomentum,
  calculateEngagementRate,
  calculateTrendingScore,
  getTrendingIndicators,
  getTimeframeHours,
  getTimeframeRange,
  calculate24hChange,
  aggregateTradeData
};
