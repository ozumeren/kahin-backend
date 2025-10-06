// src/controllers/dev.controller.js
const devService = require('../services/dev.service');
class DevController {
  async setupTest(req, res) {
    try {
      const result = await devService.setupTestEnvironment();
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ message: 'Test ortamı kurulurken hata oluştu.', error: error.message });
    }
  }
}
module.exports = new DevController();