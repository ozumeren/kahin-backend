// src/controllers/user.controller.js
const userService = require('../services/user.service');

class UserController {
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
}

module.exports = new UserController();