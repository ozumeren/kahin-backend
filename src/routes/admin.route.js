// src/routes/admin.route.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const priceHistoryController = require('../controllers/priceHistory.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');

// ========== DASHBOARD ==========

// GET /api/v1/admin/dashboard - Admin dashboard stats
router.get('/dashboard',
  authMiddleware,
  adminMiddleware,
  adminController.getDashboard
);

// GET /api/v1/admin/activity - Recent platform activity
router.get('/activity',
  authMiddleware,
  adminMiddleware,
  adminController.getRecentActivity
);

// ========== ANALYTICS ==========

// GET /api/v1/admin/analytics/users - User growth over time
router.get('/analytics/users',
  authMiddleware,
  adminMiddleware,
  adminController.getUserGrowthAnalytics
);

// GET /api/v1/admin/analytics/volume - Volume over time
router.get('/analytics/volume',
  authMiddleware,
  adminMiddleware,
  adminController.getVolumeAnalytics
);

// GET /api/v1/admin/analytics/markets - Market analytics
router.get('/analytics/markets',
  authMiddleware,
  adminMiddleware,
  adminController.getMarketAnalytics
);

// ========== MARKETS MANAGEMENT ==========

// GET /api/v1/admin/markets - List all markets (admin view)
router.get('/markets',
  authMiddleware,
  adminMiddleware,
  adminController.getAllMarkets
);

// POST /api/v1/admin/markets - Create market
router.post('/markets',
  authMiddleware,
  adminMiddleware,
  adminController.createMarket
);

// PUT /api/v1/admin/markets/:id - Update market
router.put('/markets/:id',
  authMiddleware,
  adminMiddleware,
  adminController.updateMarket
);

// DELETE /api/v1/admin/markets/:id - Delete market
router.delete('/markets/:id',
  authMiddleware,
  adminMiddleware,
  adminController.deleteMarket
);

// POST /api/v1/admin/markets/:id/resolve - Resolve market
router.post('/markets/:id/resolve',
  authMiddleware,
  adminMiddleware,
  adminController.resolveMarket
);

// POST /api/v1/admin/markets/:id/close - Close market
router.post('/markets/:id/close',
  authMiddleware,
  adminMiddleware,
  adminController.closeMarket
);

// POST /api/v1/admin/markets/:id/backfill-prices - Backfill price history
router.post('/markets/:id/backfill-prices',
  authMiddleware,
  adminMiddleware,
  priceHistoryController.backfillPrices
);

// ========== USERS MANAGEMENT ==========

// GET /api/v1/admin/users - List all users
router.get('/users',
  authMiddleware,
  adminMiddleware,
  adminController.getAllUsers
);

// GET /api/v1/admin/users/:id - Get user details
router.get('/users/:id',
  authMiddleware,
  adminMiddleware,
  adminController.getUserDetails
);

// GET /api/v1/admin/users/:id/activity - Get user activity
router.get('/users/:id/activity',
  authMiddleware,
  adminMiddleware,
  adminController.getUserActivity
);

// PATCH /api/v1/admin/users/:id/promote - Promote to admin
router.patch('/users/:id/promote',
  authMiddleware,
  adminMiddleware,
  adminController.promoteToAdmin
);

// PATCH /api/v1/admin/users/:id/demote - Demote from admin
router.patch('/users/:id/demote',
  authMiddleware,
  adminMiddleware,
  adminController.demoteFromAdmin
);

// PATCH /api/v1/admin/users/:id/ban - Ban user
router.patch('/users/:id/ban',
  authMiddleware,
  adminMiddleware,
  adminController.banUser
);

// PATCH /api/v1/admin/users/:id/unban - Unban user
router.patch('/users/:id/unban',
  authMiddleware,
  adminMiddleware,
  adminController.unbanUser
);

// POST /api/v1/admin/users/:id/add-balance - Add balance
router.post('/users/:id/add-balance',
  authMiddleware,
  adminMiddleware,
  adminController.addBalanceToUser
);

// POST /api/v1/admin/users/:id/add-shares - Add shares
router.post('/users/:id/add-shares',
  authMiddleware,
  adminMiddleware,
  adminController.addSharesToUser
);

// ========== CONTRACTS MANAGEMENT ==========

// GET /api/v1/admin/contracts - List all contracts
router.get('/contracts',
  authMiddleware,
  adminMiddleware,
  adminController.getAllContracts
);

// GET /api/v1/admin/contracts/:id - Get contract details
router.get('/contracts/:id',
  authMiddleware,
  adminMiddleware,
  adminController.getContractDetails
);

// PATCH /api/v1/admin/contracts/:id/approve - Approve contract
router.patch('/contracts/:id/approve',
  authMiddleware,
  adminMiddleware,
  adminController.approveContract
);

// PATCH /api/v1/admin/contracts/:id/reject - Reject contract
router.patch('/contracts/:id/reject',
  authMiddleware,
  adminMiddleware,
  adminController.rejectContract
);

// PATCH /api/v1/admin/contracts/:id/publish - Publish contract
router.patch('/contracts/:id/publish',
  authMiddleware,
  adminMiddleware,
  adminController.publishContract
);

// ========== ORDERS MANAGEMENT ==========

// GET /api/v1/admin/orders - List all orders
router.get('/orders',
  authMiddleware,
  adminMiddleware,
  adminController.getAllOrders
);

// DELETE /api/v1/admin/orders/:id - Cancel any order
router.delete('/orders/:id',
  authMiddleware,
  adminMiddleware,
  adminController.cancelOrderAdmin
);

// ========== MARKET HEALTH & LIQUIDITY ==========

// GET /api/v1/admin/markets/:id/health - Get market health metrics
router.get('/markets/:id/health',
  authMiddleware,
  adminMiddleware,
  adminController.getMarketHealth
);

// GET /api/v1/admin/markets/low-liquidity - Get markets with low liquidity
router.get('/markets/low-liquidity',
  authMiddleware,
  adminMiddleware,
  adminController.getLowLiquidityMarkets
);

// POST /api/v1/admin/markets/:id/pause - Pause market trading
router.post('/markets/:id/pause',
  authMiddleware,
  adminMiddleware,
  adminController.pauseMarket
);

// POST /api/v1/admin/markets/:id/resume - Resume market trading
router.post('/markets/:id/resume',
  authMiddleware,
  adminMiddleware,
  adminController.resumeMarket
);

// GET /api/v1/admin/markets/auto-close-candidates - Get markets eligible for auto-close
router.get('/markets/auto-close-candidates',
  authMiddleware,
  adminMiddleware,
  adminController.getMarketsForAutoClose
);

// GET /api/v1/admin/markets/paused - Get all paused markets
router.get('/markets/paused',
  authMiddleware,
  adminMiddleware,
  adminController.getPausedMarkets
);

// ========== ENHANCED RESOLUTION ==========

// GET /api/v1/admin/markets/:id/resolution-preview - Preview resolution impact
router.get('/markets/:id/resolution-preview',
  authMiddleware,
  adminMiddleware,
  adminController.getResolutionPreview
);

// POST /api/v1/admin/markets/:id/resolve-enhanced - Resolve with evidence and notes
router.post('/markets/:id/resolve-enhanced',
  authMiddleware,
  adminMiddleware,
  adminController.resolveMarketEnhanced
);

// POST /api/v1/admin/markets/:id/schedule-resolution - Schedule automatic resolution
router.post('/markets/:id/schedule-resolution',
  authMiddleware,
  adminMiddleware,
  adminController.scheduleResolution
);

// GET /api/v1/admin/markets/scheduled-resolutions - Get markets with scheduled resolutions
router.get('/markets/scheduled-resolutions',
  authMiddleware,
  adminMiddleware,
  adminController.getScheduledResolutions
);

// ========== RESOLUTION HISTORY ==========

// GET /api/v1/admin/markets/:id/resolution-history - Get resolution history for a market
router.get('/markets/:id/resolution-history',
  authMiddleware,
  adminMiddleware,
  adminController.getMarketResolutionHistory
);

// GET /api/v1/admin/resolution-history - Get all resolution history
router.get('/resolution-history',
  authMiddleware,
  adminMiddleware,
  adminController.getAllResolutionHistory
);

// ========== DISPUTE MANAGEMENT ==========

// GET /api/v1/admin/disputes - Get all disputes with filters
router.get('/disputes',
  authMiddleware,
  adminMiddleware,
  adminController.getAllDisputes
);

// GET /api/v1/admin/disputes/stats - Get dispute statistics
router.get('/disputes/stats',
  authMiddleware,
  adminMiddleware,
  adminController.getDisputeStats
);

// GET /api/v1/admin/disputes/:id - Get dispute by ID
router.get('/disputes/:id',
  authMiddleware,
  adminMiddleware,
  adminController.getDisputeById
);

// GET /api/v1/admin/markets/:id/disputes - Get disputes for a specific market
router.get('/markets/:id/disputes',
  authMiddleware,
  adminMiddleware,
  adminController.getMarketDisputes
);

// POST /api/v1/admin/disputes - Create new dispute
router.post('/disputes',
  authMiddleware,
  adminMiddleware,
  adminController.createDispute
);

// PATCH /api/v1/admin/disputes/:id/status - Update dispute status
router.patch('/disputes/:id/status',
  authMiddleware,
  adminMiddleware,
  adminController.updateDisputeStatus
);

// PATCH /api/v1/admin/disputes/:id/priority - Update dispute priority
router.patch('/disputes/:id/priority',
  authMiddleware,
  adminMiddleware,
  adminController.updateDisputePriority
);

// POST /api/v1/admin/disputes/:id/upvote - Upvote a dispute
router.post('/disputes/:id/upvote',
  authMiddleware,
  adminMiddleware,
  adminController.upvoteDispute
);

// ========== TREASURY & FINANCIAL CONTROLS ==========

// GET /api/v1/admin/treasury/overview - Get treasury overview
router.get('/treasury/overview',
  authMiddleware,
  adminMiddleware,
  adminController.getTreasuryOverview
);

// GET /api/v1/admin/treasury/liquidity - Get liquidity status
router.get('/treasury/liquidity',
  authMiddleware,
  adminMiddleware,
  adminController.getLiquidityStatus
);

// GET /api/v1/admin/treasury/negative-balances - Get users with negative balance
router.get('/treasury/negative-balances',
  authMiddleware,
  adminMiddleware,
  adminController.getNegativeBalances
);

// GET /api/v1/admin/treasury/top-holders - Get top balance holders
router.get('/treasury/top-holders',
  authMiddleware,
  adminMiddleware,
  adminController.getTopBalanceHolders
);

// POST /api/v1/admin/treasury/reconciliation - Run reconciliation check
router.post('/treasury/reconciliation',
  authMiddleware,
  adminMiddleware,
  adminController.runReconciliation
);

// ========== USER BALANCE MANAGEMENT ==========

// POST /api/v1/admin/users/:id/balance/adjust - Adjust user balance
router.post('/users/:id/balance/adjust',
  authMiddleware,
  adminMiddleware,
  adminController.adjustUserBalance
);

// POST /api/v1/admin/users/:id/balance/freeze - Freeze user balance
router.post('/users/:id/balance/freeze',
  authMiddleware,
  adminMiddleware,
  adminController.freezeUserBalance
);

// POST /api/v1/admin/users/:id/balance/unfreeze - Unfreeze user balance
router.post('/users/:id/balance/unfreeze',
  authMiddleware,
  adminMiddleware,
  adminController.unfreezeUserBalance
);

// GET /api/v1/admin/users/:id/balance/history - Get user balance history
router.get('/users/:id/balance/history',
  authMiddleware,
  adminMiddleware,
  adminController.getUserBalanceHistory
);

// GET /api/v1/admin/balance-adjustments - Get all balance adjustments
router.get('/balance-adjustments',
  authMiddleware,
  adminMiddleware,
  adminController.getBalanceAdjustmentHistory
);

// ========== TRANSACTION MONITORING ==========

// GET /api/v1/admin/transactions - Get all transactions
router.get('/transactions',
  authMiddleware,
  adminMiddleware,
  adminController.getAllTransactions
);

// GET /api/v1/admin/transactions/large - Get large transactions
router.get('/transactions/large',
  authMiddleware,
  adminMiddleware,
  adminController.getLargeTransactions
);

module.exports = router;
