// src/controllers/notification.controller.js
const notificationService = require('../services/notification.service');

class NotificationController {
  // ========== Bildirim Listeleme ==========

  /**
   * GET /api/v1/notifications
   * Kullanıcının bildirimlerini listele
   */
  async getNotifications(req, res, next) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const unreadOnly = req.query.unread_only === 'true';

      const result = await notificationService.getUserNotifications(
        userId,
        page,
        limit,
        unreadOnly
      );

      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/notifications/:notificationId
   * Bildirim detayını getir
   */
  async getNotification(req, res, next) {
    try {
      const userId = req.user.id;
      const { notificationId } = req.params;

      const notification = await notificationService.getNotificationById(
        notificationId,
        userId
      );

      res.status(200).json({
        success: true,
        data: notification
      });
    } catch (error) {
      next(error);
    }
  }

  // ========== Bildirim Okuma ==========

  /**
   * POST /api/v1/notifications/:notificationId/read
   * Bildirimi okundu olarak işaretle
   */
  async markAsRead(req, res, next) {
    try {
      const userId = req.user.id;
      const { notificationId } = req.params;

      const notification = await notificationService.markAsRead(
        notificationId,
        userId
      );

      res.status(200).json({
        success: true,
        message: 'Bildirim okundu olarak işaretlendi',
        data: notification
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/notifications/mark-all-read
   * Tüm bildirimleri okundu olarak işaretle
   */
  async markAllAsRead(req, res, next) {
    try {
      const userId = req.user.id;

      const result = await notificationService.markAllAsRead(userId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ========== Bildirim Silme ==========

  /**
   * DELETE /api/v1/notifications/:notificationId
   * Bildirimi sil
   */
  async deleteNotification(req, res, next) {
    try {
      const userId = req.user.id;
      const { notificationId } = req.params;

      const result = await notificationService.deleteNotification(
        notificationId,
        userId
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/notifications
   * Tüm bildirimleri sil
   */
  async deleteAllNotifications(req, res, next) {
    try {
      const userId = req.user.id;

      const result = await notificationService.deleteAllNotifications(userId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/notifications/read
   * Okunmuş bildirimleri sil
   */
  async deleteReadNotifications(req, res, next) {
    try {
      const userId = req.user.id;

      const result = await notificationService.deleteReadNotifications(userId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ========== İstatistikler ==========

  /**
   * GET /api/v1/notifications/unread-count
   * Okunmamış bildirim sayısını getir
   */
  async getUnreadCount(req, res, next) {
    try {
      const userId = req.user.id;

      const count = await notificationService.getUnreadCount(userId);

      res.status(200).json({
        success: true,
        data: {
          unread_count: count
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/notifications/stats
   * Bildirim istatistiklerini getir
   */
  async getStats(req, res, next) {
    try {
      const userId = req.user.id;

      const stats = await notificationService.getNotificationStats(userId);

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  // ========== Admin/Sistem Fonksiyonları ==========

  /**
   * POST /api/v1/notifications/cleanup
   * Eski bildirimleri temizle (admin)
   */
  async cleanupOldNotifications(req, res, next) {
    try {
      const result = await notificationService.cleanupOldNotifications();

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new NotificationController();
