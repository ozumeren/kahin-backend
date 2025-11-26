// src/routes/notification.route.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const adminMiddleware = require('../middlewares/admin.middleware');

// Tüm route'lar auth gerektirir
router.use(authMiddleware);

// ========== İstatistikler (route order için üstte) ==========

// GET /api/v1/notifications/unread-count - Okunmamış bildirim sayısı
router.get('/unread-count', notificationController.getUnreadCount);

// GET /api/v1/notifications/stats - Bildirim istatistikleri
router.get('/stats', notificationController.getStats);

// ========== Bildirim Listeleme ==========

// GET /api/v1/notifications - Bildirimleri listele
// Query params: ?page=1&limit=20&unread_only=true
router.get('/', notificationController.getNotifications);

// GET /api/v1/notifications/:notificationId - Bildirim detayı
router.get('/:notificationId', notificationController.getNotification);

// ========== Bildirim Okuma ==========

// POST /api/v1/notifications/mark-all-read - Tümünü okundu işaretle
router.post('/mark-all-read', notificationController.markAllAsRead);

// POST /api/v1/notifications/:notificationId/read - Okundu işaretle
router.post('/:notificationId/read', notificationController.markAsRead);

// ========== Bildirim Silme ==========

// DELETE /api/v1/notifications/read - Okunmuş bildirimleri sil
router.delete('/read', notificationController.deleteReadNotifications);

// DELETE /api/v1/notifications/:notificationId - Bildirimi sil
router.delete('/:notificationId', notificationController.deleteNotification);

// DELETE /api/v1/notifications - Tüm bildirimleri sil
router.delete('/', notificationController.deleteAllNotifications);

// ========== Admin Routes ==========

// POST /api/v1/notifications/cleanup - Eski bildirimleri temizle (admin only)
router.post('/cleanup', adminMiddleware, notificationController.cleanupOldNotifications);

module.exports = router;
