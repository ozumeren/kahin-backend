// src/controllers/user.controller.js
const userService = require('../services/user.service');

class UserController {
  // Mevcut kullanıcının kendi profilini getir
  async getMe(req, res, next) {
    try {
      const userId = req.user.id;
      const userWithPortfolio = await userService.findUserWithPortfolio(userId);

      res.status(200).json({
        success: true,
        data: userWithPortfolio
      });
    } catch (error) {
      next(error);
    }
  }

  // ========== YENİ: Profil Güncelleme ==========
  async updateMe(req, res, next) {
    try {
      const userId = req.user.id;
      const updateData = req.body;

      const updatedUser = await userService.updateProfile(userId, updateData);

      res.status(200).json({
        success: true,
        message: 'Profil başarıyla güncellendi',
        data: updatedUser
      });
    } catch (error) {
      next(error);
    }
  }

  // ========== YENİ: Public Profil ==========
  async getPublicProfile(req, res, next) {
    try {
      const { id } = req.params;
      const publicProfile = await userService.getPublicProfile(id);

      res.status(200).json({
        success: true,
        data: publicProfile
      });
    } catch (error) {
      next(error);
    }
  }

  // ========== YENİ: Kullanıcı İstatistikleri ==========
  async getMyStats(req, res, next) {
    try {
      const userId = req.user.id;
      const stats = await userService.getUserStats(userId);

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  // ========== YENİ: Leaderboard ==========
  async getLeaderboard(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const timeframe = req.query.timeframe || 'all'; // all, week, month

      const leaderboard = await userService.getLeaderboard(limit, timeframe);

      res.status(200).json({
        success: true,
        count: leaderboard.length,
        data: leaderboard
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UserController();