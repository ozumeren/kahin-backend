// src/services/notification.service.js
const { Notification, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const ApiError = require('../utils/apiError');
const websocketServer = require('../../config/websocket');

class NotificationService {
  // ========== Bildirim Oluşturma ==========

  /**
   * Yeni bildirim oluştur ve kullanıcıya gönder
   * @param {string} userId - Bildirimi alacak kullanıcı ID
   * @param {string} type - Bildirim tipi (message, trade, market_update, system, order, portfolio)
   * @param {string} title - Bildirim başlığı
   * @param {string} message - Bildirim mesajı
   * @param {object} data - Ek veri (opsiyonel)
   * @param {string} actionUrl - Tıklama URL'i (opsiyonel)
   * @returns {Promise<Notification>}
   */
  async createNotification(userId, type, title, message, data = null, actionUrl = null) {
    try {
      // Kullanıcının var olduğunu kontrol et
      const user = await User.findByPk(userId);
      if (!user) {
        throw ApiError.notFound('Kullanıcı bulunamadı');
      }

      // Bildirimi oluştur
      const notification = await Notification.create({
        user_id: userId,
        type,
        title,
        message,
        data,
        action_url: actionUrl
      });

      // WebSocket ile kullanıcıya gerçek zamanlı bildirim gönder
      await this.notifyUser(userId, notification);

      return notification;
    } catch (error) {
      console.error('Bildirim oluşturma hatası:', error);
      throw error;
    }
  }

  /**
   * Birden fazla kullanıcıya bildirim gönder
   * @param {array} userIds - Kullanıcı ID'leri
   * @param {string} type - Bildirim tipi
   * @param {string} title - Bildirim başlığı
   * @param {string} message - Bildirim mesajı
   * @param {object} data - Ek veri (opsiyonel)
   * @param {string} actionUrl - Tıklama URL'i (opsiyonel)
   */
  async createBulkNotifications(userIds, type, title, message, data = null, actionUrl = null) {
    try {
      const notifications = userIds.map(userId => ({
        user_id: userId,
        type,
        title,
        message,
        data,
        action_url: actionUrl
      }));

      const createdNotifications = await Notification.bulkCreate(notifications);

      // Her kullanıcıya WebSocket bildirimi gönder
      createdNotifications.forEach(notification => {
        this.notifyUser(notification.user_id, notification);
      });

      return createdNotifications;
    } catch (error) {
      console.error('Toplu bildirim oluşturma hatası:', error);
      throw error;
    }
  }

  // ========== Bildirim Listeleme ==========

  /**
   * Kullanıcının bildirimlerini getir
   * @param {string} userId - Kullanıcı ID
   * @param {number} page - Sayfa numarası
   * @param {number} limit - Sayfa başına kayıt sayısı
   * @param {boolean} unreadOnly - Sadece okunmamışları getir
   * @returns {Promise<object>}
   */
  async getUserNotifications(userId, page = 1, limit = 20, unreadOnly = false) {
    const offset = (page - 1) * limit;

    const whereClause = { user_id: userId };
    if (unreadOnly) {
      whereClause.is_read = false;
    }

    const { count, rows } = await Notification.findAndCountAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      notifications: rows,
      pagination: {
        total: count,
        page,
        limit,
        total_pages: Math.ceil(count / limit),
        has_more: offset + rows.length < count
      }
    };
  }

  /**
   * Bildirimi ID ile getir
   * @param {string} notificationId - Bildirim ID
   * @param {string} userId - Kullanıcı ID (yetkilendirme için)
   * @returns {Promise<Notification>}
   */
  async getNotificationById(notificationId, userId) {
    const notification = await Notification.findByPk(notificationId);

    if (!notification) {
      throw ApiError.notFound('Bildirim bulunamadı');
    }

    // Kullanıcının kendi bildirimi mi kontrol et
    if (notification.user_id !== userId) {
      throw ApiError.forbidden('Bu bildirime erişim yetkiniz yok');
    }

    return notification;
  }

  // ========== Bildirim Okuma ==========

  /**
   * Bildirimi okundu olarak işaretle
   * @param {string} notificationId - Bildirim ID
   * @param {string} userId - Kullanıcı ID
   * @returns {Promise<Notification>}
   */
  async markAsRead(notificationId, userId) {
    const notification = await this.getNotificationById(notificationId, userId);

    if (notification.is_read) {
      return notification;
    }

    await notification.update({
      is_read: true,
      read_at: new Date()
    });

    return notification;
  }

  /**
   * Tüm bildirimleri okundu olarak işaretle
   * @param {string} userId - Kullanıcı ID
   * @returns {Promise<object>}
   */
  async markAllAsRead(userId) {
    const [updatedCount] = await Notification.update(
      {
        is_read: true,
        read_at: new Date()
      },
      {
        where: {
          user_id: userId,
          is_read: false
        }
      }
    );

    return {
      success: true,
      message: `${updatedCount} bildirim okundu olarak işaretlendi`,
      count: updatedCount
    };
  }

  // ========== Bildirim Silme ==========

  /**
   * Bildirimi sil
   * @param {string} notificationId - Bildirim ID
   * @param {string} userId - Kullanıcı ID
   * @returns {Promise<object>}
   */
  async deleteNotification(notificationId, userId) {
    const notification = await this.getNotificationById(notificationId, userId);

    await notification.destroy();

    return {
      success: true,
      message: 'Bildirim silindi'
    };
  }

  /**
   * Tüm bildirimleri sil
   * @param {string} userId - Kullanıcı ID
   * @returns {Promise<object>}
   */
  async deleteAllNotifications(userId) {
    const deletedCount = await Notification.destroy({
      where: { user_id: userId }
    });

    return {
      success: true,
      message: `${deletedCount} bildirim silindi`,
      count: deletedCount
    };
  }

  /**
   * Okunmuş bildirimleri sil
   * @param {string} userId - Kullanıcı ID
   * @returns {Promise<object>}
   */
  async deleteReadNotifications(userId) {
    const deletedCount = await Notification.destroy({
      where: {
        user_id: userId,
        is_read: true
      }
    });

    return {
      success: true,
      message: `${deletedCount} okunmuş bildirim silindi`,
      count: deletedCount
    };
  }

  // ========== İstatistikler ==========

  /**
   * Okunmamış bildirim sayısını getir
   * @param {string} userId - Kullanıcı ID
   * @returns {Promise<number>}
   */
  async getUnreadCount(userId) {
    const count = await Notification.count({
      where: {
        user_id: userId,
        is_read: false
      }
    });

    return count;
  }

  /**
   * Bildirim istatistiklerini getir
   * @param {string} userId - Kullanıcı ID
   * @returns {Promise<object>}
   */
  async getNotificationStats(userId) {
    const [total, unread, byType] = await Promise.all([
      // Toplam bildirim sayısı
      Notification.count({ where: { user_id: userId } }),

      // Okunmamış bildirim sayısı
      Notification.count({ where: { user_id: userId, is_read: false } }),

      // Tiplere göre bildirim sayısı
      sequelize.query(`
        SELECT type, COUNT(*) as count
        FROM notifications
        WHERE user_id = :userId
        GROUP BY type
      `, {
        replacements: { userId },
        type: sequelize.QueryTypes.SELECT
      })
    ]);

    return {
      total,
      unread,
      read: total - unread,
      by_type: byType.reduce((acc, item) => {
        acc[item.type] = parseInt(item.count);
        return acc;
      }, {})
    };
  }

  // ========== WebSocket Bildirimleri ==========

  /**
   * WebSocket ile kullanıcıya bildirim gönder
   * @param {string} userId - Kullanıcı ID
   * @param {Notification} notification - Bildirim objesi
   */
  async notifyUser(userId, notification) {
    try {
      websocketServer.sendToUser(userId, {
        type: 'new_notification',
        data: {
          notification: notification.toJSON ? notification.toJSON() : notification
        }
      });
    } catch (error) {
      console.error('WebSocket bildirimi gönderme hatası:', error);
    }
  }

  // ========== Yardımcı Fonksiyonlar ==========

  /**
   * Eski bildirimleri temizle (30 günden eski okunmuş bildirimler)
   * @returns {Promise<object>}
   */
  async cleanupOldNotifications() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const deletedCount = await Notification.destroy({
      where: {
        is_read: true,
        read_at: {
          [Op.lt]: thirtyDaysAgo
        }
      }
    });

    console.log(`🧹 ${deletedCount} eski bildirim temizlendi`);

    return {
      success: true,
      message: `${deletedCount} eski bildirim temizlendi`,
      count: deletedCount
    };
  }
}

module.exports = new NotificationService();
