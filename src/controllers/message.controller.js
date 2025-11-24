// src/controllers/message.controller.js
const messageService = require('../services/message.service');

class MessageController {
  // ========== Konuşma Endpoints ==========

  // Özel konuşma başlat veya mevcut olanı getir
  async startPrivateConversation(req, res, next) {
    try {
      const userId = req.user.id;
      const { targetUserId } = req.body;

      if (!targetUserId) {
        return res.status(400).json({
          success: false,
          message: 'Hedef kullanıcı ID\'si gereklidir'
        });
      }

      const conversation = await messageService.getOrCreatePrivateConversation(userId, targetUserId);

      res.status(200).json({
        success: true,
        data: conversation
      });
    } catch (error) {
      next(error);
    }
  }

  // Grup konuşması oluştur
  async createGroup(req, res, next) {
    try {
      const userId = req.user.id;
      const { title, participantIds } = req.body;

      const conversation = await messageService.createGroupConversation(userId, title, participantIds);

      res.status(201).json({
        success: true,
        message: 'Grup oluşturuldu',
        data: conversation
      });
    } catch (error) {
      next(error);
    }
  }

  // Kullanıcının konuşmalarını listele
  async getConversations(req, res, next) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;

      const result = await messageService.getUserConversations(userId, page, limit);

      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }

  // Konuşma detayı
  async getConversation(req, res, next) {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;

      const conversation = await messageService.getConversationById(conversationId, userId);

      res.status(200).json({
        success: true,
        data: conversation
      });
    } catch (error) {
      next(error);
    }
  }

  // ========== Mesaj Endpoints ==========

  // Mesaj gönder
  async sendMessage(req, res, next) {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;
      const { content, messageType, attachmentUrl, replyToId } = req.body;

      const message = await messageService.sendMessage(
        userId,
        conversationId,
        content,
        messageType || 'text',
        attachmentUrl,
        replyToId
      );

      res.status(201).json({
        success: true,
        message: 'Mesaj gönderildi',
        data: message
      });
    } catch (error) {
      next(error);
    }
  }

  // Konuşmadaki mesajları getir
  async getMessages(req, res, next) {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const before = req.query.before; // ISO date string

      const result = await messageService.getMessages(userId, conversationId, page, limit, before);

      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }

  // Mesajı düzenle
  async editMessage(req, res, next) {
    try {
      const userId = req.user.id;
      const { messageId } = req.params;
      const { content } = req.body;

      const message = await messageService.editMessage(userId, messageId, content);

      res.status(200).json({
        success: true,
        message: 'Mesaj düzenlendi',
        data: message
      });
    } catch (error) {
      next(error);
    }
  }

  // Mesajı sil
  async deleteMessage(req, res, next) {
    try {
      const userId = req.user.id;
      const { messageId } = req.params;

      const result = await messageService.deleteMessage(userId, messageId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // Mesajları okundu olarak işaretle
  async markAsRead(req, res, next) {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;

      const result = await messageService.markAsRead(userId, conversationId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ========== Grup Yönetimi ==========

  // Gruba katılımcı ekle
  async addParticipant(req, res, next) {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;
      const { newUserId } = req.body;

      if (!newUserId) {
        return res.status(400).json({
          success: false,
          message: 'Eklenecek kullanıcı ID\'si gereklidir'
        });
      }

      const conversation = await messageService.addParticipant(userId, conversationId, newUserId);

      res.status(200).json({
        success: true,
        message: 'Katılımcı eklendi',
        data: conversation
      });
    } catch (error) {
      next(error);
    }
  }

  // Gruptan ayrıl
  async leaveConversation(req, res, next) {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;

      const result = await messageService.leaveConversation(userId, conversationId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // Konuşmayı sessize al/aç
  async toggleMute(req, res, next) {
    try {
      const userId = req.user.id;
      const { conversationId } = req.params;

      const result = await messageService.toggleMute(userId, conversationId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ========== Arama ve İstatistikler ==========

  // Mesajlarda ara
  async searchMessages(req, res, next) {
    try {
      const userId = req.user.id;
      const { q } = req.query;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;

      const result = await messageService.searchMessages(userId, q, page, limit);

      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }

  // Okunmamış mesaj sayısı
  async getUnreadCount(req, res, next) {
    try {
      const userId = req.user.id;

      const unreadCount = await messageService.getUnreadCount(userId);

      res.status(200).json({
        success: true,
        data: {
          unread_count: unreadCount
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MessageController();
