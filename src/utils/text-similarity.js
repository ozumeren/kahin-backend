// src/utils/text-similarity.js

/**
 * Simple fuzzy match score between query and text
 * @param {string} text - Text to search in
 * @param {string} query - Search query
 * @returns {number} Match score 0-100
 */
function fuzzyMatch(text, query) {
  if (!text || !query) return 0;

  const normalizedText = text.toLowerCase().trim();
  const normalizedQuery = query.toLowerCase().trim();

  // Exact match
  if (normalizedText === normalizedQuery) return 100;

  // Contains exact query
  if (normalizedText.includes(normalizedQuery)) {
    // Position-based bonus (earlier = better)
    const position = normalizedText.indexOf(normalizedQuery);
    const positionBonus = Math.max(0, 20 - (position / normalizedText.length * 20));
    return 80 + positionBonus;
  }

  // Word match - check if all query words are in text
  const textWords = normalizedText.split(/\s+/);
  const queryWords = normalizedQuery.split(/\s+/);

  let matchedWords = 0;
  for (const queryWord of queryWords) {
    if (textWords.some(textWord => textWord.includes(queryWord) || queryWord.includes(textWord))) {
      matchedWords++;
    }
  }

  if (matchedWords > 0) {
    return (matchedWords / queryWords.length) * 70;
  }

  // Levenshtein distance for partial matches
  const distance = levenshteinDistance(normalizedText.substring(0, 50), normalizedQuery);
  const maxLen = Math.max(normalizedQuery.length, 50);
  const similarity = Math.max(0, (1 - distance / maxLen) * 40);

  return similarity;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Extract keywords from text
 */
function extractKeywords(text) {
  if (!text) return [];

  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'and', 'but', 'if', 'or', 'because', 'until', 'while', 'about', 'against',
    've', 'mi', 'mı', 'mu', 'mü', 'bir', 'bu', 've', 'ile', 'için', 'de', 'da',
    'olacak', 'olur', 'olan', 'ola', 'ya', 'ne', 'her', 'kadar', 'gibi'
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  return [...new Set(words)];
}

/**
 * Calculate cosine similarity between two keyword arrays
 */
function cosineSimilarity(keywords1, keywords2) {
  if (!keywords1.length || !keywords2.length) return 0;

  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);

  let intersection = 0;
  for (const word of set1) {
    if (set2.has(word)) intersection++;
  }

  const similarity = intersection / Math.sqrt(set1.size * set2.size);
  return similarity * 100;
}

/**
 * Highlight search term in text
 */
function highlightText(text, query) {
  if (!text || !query) return text;

  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Calculate search relevance score
 */
function calculateSearchRelevance(market, query) {
  const titleMatch = fuzzyMatch(market.title, query) * 0.50;
  const descMatch = fuzzyMatch(market.description, query) * 0.25;

  const volume = parseFloat(market.volume || 0);
  const volumeScore = Math.min(100, Math.log10(volume + 1) * 20) * 0.15;

  const createdAt = new Date(market.createdAt);
  const daysSince = (new Date() - createdAt) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 100 - daysSince * 2) * 0.10;

  return titleMatch + descMatch + volumeScore + recencyScore;
}

/**
 * Generate search suggestions based on query
 */
function generateSuggestions(query, markets) {
  if (!query || !markets.length) return [];

  const suggestions = new Set();
  const queryLower = query.toLowerCase();

  for (const market of markets.slice(0, 100)) {
    const keywords = extractKeywords(market.title);
    for (const keyword of keywords) {
      if (keyword.startsWith(queryLower) || keyword.includes(queryLower)) {
        suggestions.add(keyword);
      }
    }

    // Also add query + common market terms
    if (suggestions.size < 5) {
      const title = market.title.toLowerCase();
      const words = title.split(/\s+/);
      for (let i = 0; i < words.length - 1; i++) {
        if (words[i].includes(queryLower)) {
          suggestions.add(`${words[i]} ${words[i + 1]}`);
        }
      }
    }

    if (suggestions.size >= 5) break;
  }

  return Array.from(suggestions).slice(0, 5);
}

module.exports = {
  fuzzyMatch,
  levenshteinDistance,
  extractKeywords,
  cosineSimilarity,
  highlightText,
  calculateSearchRelevance,
  generateSuggestions
};
