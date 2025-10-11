// src/controllers/dev.controller.js
const devService = require('../services/dev.service');
const websocketServer = require('../../config/websocket');

class DevController {
  async setupTest(req, res) {
    try {
      const result = await devService.setupTestEnvironment();
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ message: 'Test ortamı kurulurken hata oluştu.', error: error.message });
    }
  }

  // Test için manuel balance update gönder
  async testBalanceUpdate(req, res) {
    try {
      const { userId, balance } = req.body;
      
      if (!userId || balance === undefined) {
        return res.status(400).json({ message: 'userId ve balance gerekli' });
      }

      console.log(`🧪 TEST: Sending balance update to user ${userId}: ${balance}`);
      await websocketServer.publishBalanceUpdate(userId, balance);
      
      res.status(200).json({ 
        message: 'Balance update gönderildi',
        userId,
        balance
      });
    } catch (error) {
      res.status(500).json({ message: 'Balance update gönderilemedi', error: error.message });
    }
  }
}
module.exports = new DevController();