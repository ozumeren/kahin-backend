// src/routes/auth.route.js
const express = require('express');
const router = express.Router();

// Henüz controller'ı yazmadığımız için bu satırı şimdilik yorum olarak bırakıyoruz.
// const authController = require('../controllers/auth.controller');
// router.post('/register', authController.register);

// Test için geçici bir rota
router.post('/register', (req, res) => {
  res.status(201).json({ message: "Register endpoint'ine ulaşıldı!", body: req.body });
});

module.exports = router;