const userService = require('../services/user.service');

class UserController {
  async getMe(req, res) {
    try {
      const userId = req.user.id;
      const userWithPortfolio = await userService.findUserWithPortfolio(userId);

      res.status(200).json(userWithPortfolio);
    } catch (error) {
      res.status(404).json({ message: error.message });
    }
  }
}

module.exports = new UserController();