// src/routes/message.route.js
const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Tüm route'lar auth gerektirir
router.use(authMiddleware);

// ========== Konuşma Routes ==========

// GET /api/v1/messages/conversations - Konuşmaları listele
router.get('/conversations', messageController.getConversations);

// POST /api/v1/messages/conversations/private - Özel konuşma başlat
router.post('/conversations/private', messageController.startPrivateConversation);

// POST /api/v1/messages/conversations/group - Grup oluştur
router.post('/conversations/group', messageController.createGroup);

// GET /api/v1/messages/conversations/:conversationId - Konuşma detayı
router.get('/conversations/:conversationId', messageController.getConversation);

// POST /api/v1/messages/conversations/:conversationId/leave - Gruptan ayrıl
router.post('/conversations/:conversationId/leave', messageController.leaveConversation);

// POST /api/v1/messages/conversations/:conversationId/mute - Sessize al/aç
router.post('/conversations/:conversationId/mute', messageController.toggleMute);

// POST /api/v1/messages/conversations/:conversationId/participants - Katılımcı ekle
router.post('/conversations/:conversationId/participants', messageController.addParticipant);

// ========== Mesaj Routes ==========

// GET /api/v1/messages/conversations/:conversationId/messages - Mesajları getir
// Query params: ?page=1&limit=50&before=ISO_DATE
router.get('/conversations/:conversationId/messages', messageController.getMessages);

// POST /api/v1/messages/conversations/:conversationId/messages - Mesaj gönder
router.post('/conversations/:conversationId/messages', messageController.sendMessage);

// POST /api/v1/messages/conversations/:conversationId/read - Okundu işaretle
router.post('/conversations/:conversationId/read', messageController.markAsRead);

// PUT /api/v1/messages/:messageId - Mesajı düzenle
router.put('/:messageId', messageController.editMessage);

// DELETE /api/v1/messages/:messageId - Mesajı sil
router.delete('/:messageId', messageController.deleteMessage);

// ========== Arama ve İstatistikler ==========

// GET /api/v1/messages/search - Mesajlarda ara
// Query params: ?q=arama_sorgusu&page=1&limit=20
router.get('/search', messageController.searchMessages);

// GET /api/v1/messages/unread-count - Okunmamış mesaj sayısı
router.get('/unread-count', messageController.getUnreadCount);

module.exports = router;
