// src/services/message.service.js
const {
  Conversation,
  ConversationParticipant,
  Message,
  User,
  sequelize
} = require('../models');
const { Op } = require('sequelize');
const ApiError = require('../utils/apiError');
const websocketServer = require('../../config/websocket');

class MessageService {
  // ========== Konuşma İşlemleri ==========

  // Yeni özel konuşma başlat veya mevcut olanı getir
  async getOrCreatePrivateConversation(userId, targetUserId) {
    const t = await sequelize.transaction();

    try {
      // Kendine mesaj gönderemez
      if (userId === targetUserId) {
        throw ApiError.badRequest('Kendinize mesaj gönderemezsiniz');
      }

      // Hedef kullanıcı var mı kontrol et
      const targetUser = await User.findByPk(targetUserId);
      if (!targetUser) {
        throw ApiError.notFound('Kullanıcı bulunamadı');
      }

      // Mevcut özel konuşma var mı kontrol et
      const existingConversation = await sequelize.query(`
        SELECT c.id
        FROM conversations c
        INNER JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = :userId AND cp1.left_at IS NULL
        INNER JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = :targetUserId AND cp2.left_at IS NULL
        WHERE c.type = 'private'
        LIMIT 1
      `, {
        replacements: { userId, targetUserId },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      });

      if (existingConversation.length > 0) {
        await t.commit();
        return this.getConversationById(existingConversation[0].id, userId);
      }

      // Yeni konuşma oluştur
      const conversation = await Conversation.create({
        type: 'private',
        created_by: userId
      }, { transaction: t });

      // Katılımcıları ekle
      await ConversationParticipant.bulkCreate([
        {
          conversation_id: conversation.id,
          user_id: userId,
          role: 'admin'
        },
        {
          conversation_id: conversation.id,
          user_id: targetUserId,
          role: 'member'
        }
      ], { transaction: t });

      await t.commit();

      return this.getConversationById(conversation.id, userId);
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // Grup konuşması oluştur
  async createGroupConversation(userId, title, participantIds) {
    const t = await sequelize.transaction();

    try {
      if (!title || title.trim().length === 0) {
        throw ApiError.badRequest('Grup adı gereklidir');
      }

      if (!participantIds || participantIds.length < 1) {
        throw ApiError.badRequest('En az bir katılımcı gereklidir');
      }

      // Tüm katılımcıların varlığını kontrol et
      const users = await User.findAll({
        where: { id: { [Op.in]: participantIds } }
      });

      if (users.length !== participantIds.length) {
        throw ApiError.badRequest('Bazı kullanıcılar bulunamadı');
      }

      // Konuşma oluştur
      const conversation = await Conversation.create({
        type: 'group',
        title: title.trim(),
        created_by: userId
      }, { transaction: t });

      // Oluşturucu ve katılımcıları ekle
      const allParticipants = [
        {
          conversation_id: conversation.id,
          user_id: userId,
          role: 'admin'
        },
        ...participantIds.filter(id => id !== userId).map(id => ({
          conversation_id: conversation.id,
          user_id: id,
          role: 'member'
        }))
      ];

      await ConversationParticipant.bulkCreate(allParticipants, { transaction: t });

      await t.commit();

      return this.getConversationById(conversation.id, userId);
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // Kullanıcının konuşmalarını listele
  async getUserConversations(userId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const { count, rows } = await Conversation.findAndCountAll({
      include: [
        {
          model: ConversationParticipant,
          as: 'participants',
          where: {
            user_id: userId,
            left_at: null
          },
          required: true
        },
        {
          model: ConversationParticipant,
          as: 'allParticipants',
          where: { left_at: null },
          required: false,
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'avatar_url']
          }]
        },
        {
          model: Message,
          as: 'lastMessage',
          required: false,
          limit: 1,
          order: [['created_at', 'DESC']],
          include: [{
            model: User,
            as: 'sender',
            attributes: ['id', 'username', 'avatar_url']
          }]
        }
      ],
      order: [['last_message_at', 'DESC NULLS LAST'], ['created_at', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    // Her konuşma için okunmamış mesaj sayısını hesapla
    const conversationsWithUnread = await Promise.all(rows.map(async (conv) => {
      const participant = conv.participants.find(p => p.user_id === userId);
      const lastReadAt = participant?.last_read_at;

      const unreadCount = await Message.count({
        where: {
          conversation_id: conv.id,
          sender_id: { [Op.ne]: userId },
          is_deleted: false,
          ...(lastReadAt ? { created_at: { [Op.gt]: lastReadAt } } : {})
        }
      });

      const convJson = conv.toJSON();
      return {
        ...convJson,
        unread_count: unreadCount,
        is_muted: participant?.is_muted || false
      };
    }));

    return {
      conversations: conversationsWithUnread,
      pagination: {
        total: count,
        page,
        limit,
        total_pages: Math.ceil(count / limit)
      }
    };
  }

  // Konuşma detayını getir
  async getConversationById(conversationId, userId) {
    // Kullanıcının bu konuşmaya erişimi var mı?
    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        user_id: userId,
        left_at: null
      }
    });

    if (!participant) {
      throw ApiError.forbidden('Bu konuşmaya erişiminiz yok');
    }

    const conversation = await Conversation.findByPk(conversationId, {
      include: [
        {
          model: ConversationParticipant,
          as: 'allParticipants',
          where: { left_at: null },
          required: false,
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'avatar_url', 'bio']
          }]
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'avatar_url']
        }
      ]
    });

    if (!conversation) {
      throw ApiError.notFound('Konuşma bulunamadı');
    }

    return conversation;
  }

  // ========== Mesaj İşlemleri ==========

  // Mesaj gönder
  async sendMessage(userId, conversationId, content, messageType = 'text', attachmentUrl = null, replyToId = null) {
    const t = await sequelize.transaction();

    try {
      // Konuşmaya erişim kontrolü
      const participant = await ConversationParticipant.findOne({
        where: {
          conversation_id: conversationId,
          user_id: userId,
          left_at: null
        },
        transaction: t
      });

      if (!participant) {
        throw ApiError.forbidden('Bu konuşmaya mesaj gönderemezsiniz');
      }

      // Reply kontrolü
      if (replyToId) {
        const replyMessage = await Message.findOne({
          where: {
            id: replyToId,
            conversation_id: conversationId,
            is_deleted: false
          },
          transaction: t
        });

        if (!replyMessage) {
          throw ApiError.notFound('Yanıtlanacak mesaj bulunamadı');
        }
      }

      // Mesaj içeriği kontrolü
      if (messageType === 'text' && (!content || content.trim().length === 0)) {
        throw ApiError.badRequest('Mesaj içeriği boş olamaz');
      }

      // Mesaj oluştur
      const message = await Message.create({
        conversation_id: conversationId,
        sender_id: userId,
        content: content?.trim() || '',
        message_type: messageType,
        attachment_url: attachmentUrl,
        reply_to_id: replyToId
      }, { transaction: t });

      // Konuşmanın last_message_at'ini güncelle
      await Conversation.update(
        { last_message_at: new Date() },
        { where: { id: conversationId }, transaction: t }
      );

      // Gönderenin last_read_at'ini güncelle
      await ConversationParticipant.update(
        { last_read_at: new Date() },
        {
          where: { conversation_id: conversationId, user_id: userId },
          transaction: t
        }
      );

      await t.commit();

      // Mesajı tam haliyle getir
      const fullMessage = await Message.findByPk(message.id, {
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'username', 'avatar_url']
          },
          {
            model: Message,
            as: 'replyTo',
            include: [{
              model: User,
              as: 'sender',
              attributes: ['id', 'username']
            }]
          }
        ]
      });

      // WebSocket ile diğer katılımcılara bildir
      await this.notifyNewMessage(conversationId, userId, fullMessage);

      return fullMessage;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // Konuşmadaki mesajları getir
  async getMessages(userId, conversationId, page = 1, limit = 50, before = null) {
    // Konuşmaya erişim kontrolü
    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        user_id: userId,
        left_at: null
      }
    });

    if (!participant) {
      throw ApiError.forbidden('Bu konuşmaya erişiminiz yok');
    }

    const whereClause = {
      conversation_id: conversationId,
      is_deleted: false
    };

    // Belirli bir tarihten önceki mesajları getir (infinite scroll için)
    if (before) {
      whereClause.created_at = { [Op.lt]: new Date(before) };
    }

    const { count, rows } = await Message.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'username', 'avatar_url']
        },
        {
          model: Message,
          as: 'replyTo',
          include: [{
            model: User,
            as: 'sender',
            attributes: ['id', 'username']
          }]
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset: before ? 0 : (page - 1) * limit
    });

    return {
      messages: rows.reverse(), // En eski önce
      pagination: {
        total: count,
        page,
        limit,
        total_pages: Math.ceil(count / limit),
        has_more: rows.length === limit
      }
    };
  }

  // Mesajı düzenle
  async editMessage(userId, messageId, newContent) {
    const message = await Message.findByPk(messageId);

    if (!message) {
      throw ApiError.notFound('Mesaj bulunamadı');
    }

    if (message.sender_id !== userId) {
      throw ApiError.forbidden('Sadece kendi mesajlarınızı düzenleyebilirsiniz');
    }

    if (message.is_deleted) {
      throw ApiError.badRequest('Silinmiş mesaj düzenlenemez');
    }

    if (!newContent || newContent.trim().length === 0) {
      throw ApiError.badRequest('Mesaj içeriği boş olamaz');
    }

    await message.update({
      content: newContent.trim(),
      is_edited: true,
      edited_at: new Date()
    });

    const fullMessage = await Message.findByPk(messageId, {
      include: [{
        model: User,
        as: 'sender',
        attributes: ['id', 'username', 'avatar_url']
      }]
    });

    // WebSocket ile bildir
    await this.notifyMessageEdited(message.conversation_id, fullMessage);

    return fullMessage;
  }

  // Mesajı sil (soft delete)
  async deleteMessage(userId, messageId) {
    const message = await Message.findByPk(messageId);

    if (!message) {
      throw ApiError.notFound('Mesaj bulunamadı');
    }

    if (message.sender_id !== userId) {
      throw ApiError.forbidden('Sadece kendi mesajlarınızı silebilirsiniz');
    }

    if (message.is_deleted) {
      throw ApiError.badRequest('Mesaj zaten silinmiş');
    }

    await message.update({
      is_deleted: true,
      deleted_at: new Date(),
      content: '' // İçeriği temizle
    });

    // WebSocket ile bildir
    await this.notifyMessageDeleted(message.conversation_id, messageId);

    return { success: true, message: 'Mesaj silindi' };
  }

  // Mesajları okundu olarak işaretle
  async markAsRead(userId, conversationId) {
    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        user_id: userId,
        left_at: null
      }
    });

    if (!participant) {
      throw ApiError.forbidden('Bu konuşmaya erişiminiz yok');
    }

    await participant.update({ last_read_at: new Date() });

    // WebSocket ile diğer katılımcılara bildir
    await this.notifyMessagesRead(conversationId, userId);

    return { success: true };
  }

  // ========== Grup Yönetimi ==========

  // Gruba katılımcı ekle
  async addParticipant(userId, conversationId, newUserId) {
    const t = await sequelize.transaction();

    try {
      const conversation = await Conversation.findByPk(conversationId, { transaction: t });

      if (!conversation || conversation.type !== 'group') {
        throw ApiError.badRequest('Sadece gruplara katılımcı eklenebilir');
      }

      // Ekleyenin admin olması gerekir
      const requester = await ConversationParticipant.findOne({
        where: {
          conversation_id: conversationId,
          user_id: userId,
          left_at: null,
          role: 'admin'
        },
        transaction: t
      });

      if (!requester) {
        throw ApiError.forbidden('Katılımcı eklemek için admin olmalısınız');
      }

      // Yeni kullanıcı var mı?
      const newUser = await User.findByPk(newUserId, { transaction: t });
      if (!newUser) {
        throw ApiError.notFound('Kullanıcı bulunamadı');
      }

      // Zaten katılımcı mı?
      const existingParticipant = await ConversationParticipant.findOne({
        where: {
          conversation_id: conversationId,
          user_id: newUserId,
          left_at: null
        },
        transaction: t
      });

      if (existingParticipant) {
        throw ApiError.badRequest('Kullanıcı zaten grupta');
      }

      // Daha önce ayrılmış mı? Tekrar ekle
      const leftParticipant = await ConversationParticipant.findOne({
        where: {
          conversation_id: conversationId,
          user_id: newUserId,
          left_at: { [Op.ne]: null }
        },
        transaction: t
      });

      if (leftParticipant) {
        await leftParticipant.update({
          left_at: null,
          joined_at: new Date(),
          role: 'member'
        }, { transaction: t });
      } else {
        await ConversationParticipant.create({
          conversation_id: conversationId,
          user_id: newUserId,
          role: 'member'
        }, { transaction: t });
      }

      // Sistem mesajı gönder
      await Message.create({
        conversation_id: conversationId,
        sender_id: userId,
        content: `${newUser.username} gruba eklendi`,
        message_type: 'system'
      }, { transaction: t });

      await t.commit();

      return this.getConversationById(conversationId, userId);
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // Gruptan ayrıl
  async leaveConversation(userId, conversationId) {
    const t = await sequelize.transaction();

    try {
      const conversation = await Conversation.findByPk(conversationId, { transaction: t });

      if (!conversation) {
        throw ApiError.notFound('Konuşma bulunamadı');
      }

      const participant = await ConversationParticipant.findOne({
        where: {
          conversation_id: conversationId,
          user_id: userId,
          left_at: null
        },
        transaction: t
      });

      if (!participant) {
        throw ApiError.badRequest('Bu konuşmada değilsiniz');
      }

      // Özel konuşmadan çıkılamaz
      if (conversation.type === 'private') {
        throw ApiError.badRequest('Özel konuşmadan ayrılamazsınız');
      }

      const user = await User.findByPk(userId, { transaction: t });

      await participant.update({ left_at: new Date() }, { transaction: t });

      // Sistem mesajı gönder
      await Message.create({
        conversation_id: conversationId,
        sender_id: userId,
        content: `${user.username} gruptan ayrıldı`,
        message_type: 'system'
      }, { transaction: t });

      await t.commit();

      return { success: true, message: 'Gruptan ayrıldınız' };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  // Konuşmayı sessize al/aç
  async toggleMute(userId, conversationId) {
    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        user_id: userId,
        left_at: null
      }
    });

    if (!participant) {
      throw ApiError.forbidden('Bu konuşmaya erişiminiz yok');
    }

    const newMuteStatus = !participant.is_muted;
    await participant.update({ is_muted: newMuteStatus });

    return {
      success: true,
      is_muted: newMuteStatus,
      message: newMuteStatus ? 'Konuşma sessize alındı' : 'Sessiz mod kapatıldı'
    };
  }

  // ========== WebSocket Bildirimleri ==========

  async notifyNewMessage(conversationId, senderId, message) {
    // Konuşmadaki tüm katılımcılara bildir (gönderen hariç)
    const participants = await ConversationParticipant.findAll({
      where: {
        conversation_id: conversationId,
        user_id: { [Op.ne]: senderId },
        left_at: null,
        is_muted: false
      }
    });

    participants.forEach(participant => {
      websocketServer.sendToUser(participant.user_id, {
        type: 'new_message',
        data: {
          conversation_id: conversationId,
          message: message.toJSON()
        }
      });
    });
  }

  async notifyMessageEdited(conversationId, message) {
    const participants = await ConversationParticipant.findAll({
      where: {
        conversation_id: conversationId,
        left_at: null
      }
    });

    participants.forEach(participant => {
      websocketServer.sendToUser(participant.user_id, {
        type: 'message_edited',
        data: {
          conversation_id: conversationId,
          message: message.toJSON()
        }
      });
    });
  }

  async notifyMessageDeleted(conversationId, messageId) {
    const participants = await ConversationParticipant.findAll({
      where: {
        conversation_id: conversationId,
        left_at: null
      }
    });

    participants.forEach(participant => {
      websocketServer.sendToUser(participant.user_id, {
        type: 'message_deleted',
        data: {
          conversation_id: conversationId,
          message_id: messageId
        }
      });
    });
  }

  async notifyMessagesRead(conversationId, userId) {
    const participants = await ConversationParticipant.findAll({
      where: {
        conversation_id: conversationId,
        user_id: { [Op.ne]: userId },
        left_at: null
      }
    });

    participants.forEach(participant => {
      websocketServer.sendToUser(participant.user_id, {
        type: 'messages_read',
        data: {
          conversation_id: conversationId,
          user_id: userId,
          read_at: new Date().toISOString()
        }
      });
    });
  }

  // ========== Arama ==========

  async searchMessages(userId, query, page = 1, limit = 20) {
    if (!query || query.trim().length < 2) {
      throw ApiError.badRequest('Arama sorgusu en az 2 karakter olmalıdır');
    }

    const offset = (page - 1) * limit;

    // Kullanıcının erişebildiği konuşmaları bul
    const userConversations = await ConversationParticipant.findAll({
      where: { user_id: userId, left_at: null },
      attributes: ['conversation_id']
    });

    const conversationIds = userConversations.map(c => c.conversation_id);

    const { count, rows } = await Message.findAndCountAll({
      where: {
        conversation_id: { [Op.in]: conversationIds },
        content: { [Op.iLike]: `%${query.trim()}%` },
        is_deleted: false
      },
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'username', 'avatar_url']
        },
        {
          model: Conversation,
          as: 'conversation',
          attributes: ['id', 'type', 'title']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      messages: rows,
      pagination: {
        total: count,
        page,
        limit,
        total_pages: Math.ceil(count / limit)
      }
    };
  }

  // Okunmamış mesaj sayısını getir
  async getUnreadCount(userId) {
    const result = await sequelize.query(`
      SELECT COUNT(DISTINCT m.id) as unread_count
      FROM messages m
      INNER JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
      WHERE cp.user_id = :userId
        AND cp.left_at IS NULL
        AND cp.is_muted = false
        AND m.sender_id != :userId
        AND m.is_deleted = false
        AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
    `, {
      replacements: { userId },
      type: sequelize.QueryTypes.SELECT
    });

    return parseInt(result[0].unread_count) || 0;
  }
}

module.exports = new MessageService();
