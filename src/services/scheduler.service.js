// src/services/scheduler.service.js
// Handles scheduled tasks for order expiration, price history, etc.

const cron = require('node-cron');
const orderService = require('./order.service');
const priceHistoryService = require('./priceHistory.service');

class SchedulerService {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Initialize all scheduled jobs
   */
  initialize() {
    if (this.isRunning) {
      console.log('⚠️ Scheduler already running');
      return;
    }

    console.log('⏰ Initializing scheduler service...');

    // 1. Cancel expired orders - runs every minute
    const expiredOrdersJob = cron.schedule('* * * * *', async () => {
      try {
        await orderService.cancelExpiredOrders();
      } catch (error) {
        console.error('❌ Expired orders job error:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'Europe/Istanbul'
    });
    this.jobs.push(expiredOrdersJob);

    // 2. Flush price history buffer - runs every minute
    const priceHistoryJob = cron.schedule('* * * * *', async () => {
      try {
        await priceHistoryService.flushBuffer();
      } catch (error) {
        console.error('❌ Price history flush error:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'Europe/Istanbul'
    });
    this.jobs.push(priceHistoryJob);

    // 3. Clean up old price history - runs daily at 3 AM
    const cleanupJob = cron.schedule('0 3 * * *', async () => {
      try {
        await this.cleanupOldPriceHistory();
      } catch (error) {
        console.error('❌ Cleanup job error:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'Europe/Istanbul'
    });
    this.jobs.push(cleanupJob);

    this.isRunning = true;
    console.log('✅ Scheduler service initialized with', this.jobs.length, 'jobs');
  }

  /**
   * Clean up old price history data
   * Keeps 1-minute data for 7 days, 5-minute for 30 days, etc.
   */
  async cleanupOldPriceHistory() {
    const { PriceHistory } = require('../models');
    const { Op } = require('sequelize');

    const retentionPolicies = {
      '1m': 7,    // 7 days
      '5m': 30,   // 30 days
      '15m': 90,  // 90 days
      '1h': 365,  // 1 year
      '4h': 730,  // 2 years
      '1d': 1825  // 5 years
    };

    let totalDeleted = 0;

    for (const [interval, days] of Object.entries(retentionPolicies)) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const deleted = await PriceHistory.destroy({
        where: {
          interval,
          timestamp: { [Op.lt]: cutoffDate }
        }
      });

      if (deleted > 0) {
        totalDeleted += deleted;
        console.log(`🧹 Cleaned up ${deleted} ${interval} candles older than ${days} days`);
      }
    }

    if (totalDeleted > 0) {
      console.log(`✅ Total cleanup: ${totalDeleted} price history records`);
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    for (const job of this.jobs) {
      job.stop();
    }
    this.jobs = [];
    this.isRunning = false;
    console.log('⏹️ Scheduler service stopped');
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobCount: this.jobs.length
    };
  }
}

module.exports = new SchedulerService();
