// src/routes/dev.route.js
const express = require('express');
const router = express.Router();
const devController = require('../controllers/dev.controller');
router.post('/setup-test', devController.setupTest);
router.post('/test-balance-update', devController.testBalanceUpdate);
module.exports = router;