// src/services/auth.service.js
const { User, RefreshToken } = require('../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Op } = require('sequelize');
const ApiError = require('../utils/apiError');
const tokenBlacklistService = require('./tokenBlacklist.service');

// Token expiration times
const ACCESS_TOKEN_EXPIRY = '15m';  // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

class AuthService {
  /**
   * Generate access token
   */
  generateAccessToken(user) {
    return jwt.sign(
      {
        id: user.id,
        role: user.role,
        type: 'access'
      },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );
  }

  /**
   * Generate refresh token and save to database
   */
  async generateRefreshToken(user, deviceInfo = null, ipAddress = null) {
    // Generate a secure random token
    const tokenValue = crypto.randomBytes(64).toString('hex');

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    // Save to database
    const refreshToken = await RefreshToken.create({
      user_id: user.id,
      token: tokenValue,
      device_info: deviceInfo,
      ip_address: ipAddress,
      expires_at: expiresAt
    });

    return tokenValue;
  }

  /**
   * Register a new user
   */
  async register(userData, deviceInfo = null, ipAddress = null) {
    const { username, email, password } = userData;

    // Check existing email
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw ApiError.conflict('Bu e-posta adresi zaten kullanılıyor.');
    }

    // Check existing username
    const existingUsername = await User.findOne({ where: { username } });
    if (existingUsername) {
      throw ApiError.conflict('Bu kullanıcı adı zaten kullanılıyor.');
    }

    // Password validation
    if (password.length < 6) {
      throw ApiError.badRequest('Şifre en az 6 karakter olmalıdır.');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword
    });

    // Generate tokens
    const accessToken = this.generateAccessToken(newUser);
    const refreshToken = await this.generateRefreshToken(newUser, deviceInfo, ipAddress);

    return {
      accessToken,
      refreshToken,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        balance: newUser.balance,
        role: newUser.role
      }
    };
  }

  /**
   * Login user
   */
  async login(email, password, deviceInfo = null, ipAddress = null) {
    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw ApiError.unauthorized('E-posta veya şifre hatalı.');
    }

    // Check if user is banned
    if (user.banned) {
      throw ApiError.forbidden(`Hesabınız engellenmiştir. Sebep: ${user.ban_reason || 'Belirtilmemiş'}`);
    }

    // Verify password
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      throw ApiError.unauthorized('E-posta veya şifre hatalı.');
    }

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user, deviceInfo, ipAddress);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        balance: user.balance,
        role: user.role,
        avatar_url: user.avatar_url,
        bio: user.bio
      }
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshTokenValue, deviceInfo = null, ipAddress = null) {
    // Find refresh token
    const refreshToken = await RefreshToken.findOne({
      where: {
        token: refreshTokenValue,
        revoked: false,
        expires_at: {
          [Op.gt]: new Date()
        }
      },
      include: [{
        model: User,
        as: 'user'
      }]
    });

    if (!refreshToken) {
      throw ApiError.unauthorized('Geçersiz veya süresi dolmuş yenileme tokeni.');
    }

    const user = refreshToken.user;

    // Check if user is banned
    if (user.banned) {
      // Revoke the refresh token
      await refreshToken.update({
        revoked: true,
        revoked_at: new Date()
      });
      throw ApiError.forbidden(`Hesabınız engellenmiştir. Sebep: ${user.ban_reason || 'Belirtilmemiş'}`);
    }

    // Rotate refresh token (revoke old, create new)
    await refreshToken.update({
      revoked: true,
      revoked_at: new Date()
    });

    // Generate new tokens
    const newAccessToken = this.generateAccessToken(user);
    const newRefreshToken = await this.generateRefreshToken(user, deviceInfo, ipAddress);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        balance: user.balance,
        role: user.role,
        avatar_url: user.avatar_url,
        bio: user.bio
      }
    };
  }

  /**
   * Logout - revoke refresh token and blacklist access token
   */
  async logout(accessToken, refreshTokenValue) {
    try {
      // Decode access token to get expiry
      const decoded = jwt.decode(accessToken);
      if (decoded && decoded.exp) {
        const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
        if (expiresIn > 0) {
          await tokenBlacklistService.blacklistToken(accessToken, expiresIn);
        }
      }

      // Revoke refresh token if provided
      if (refreshTokenValue) {
        await RefreshToken.update(
          {
            revoked: true,
            revoked_at: new Date()
          },
          {
            where: { token: refreshTokenValue }
          }
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: true }; // Still return success, token will expire anyway
    }
  }

  /**
   * Logout from all devices - revoke all refresh tokens
   */
  async logoutAll(userId, currentAccessToken) {
    try {
      // Blacklist current access token
      const decoded = jwt.decode(currentAccessToken);
      if (decoded && decoded.exp) {
        const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
        if (expiresIn > 0) {
          await tokenBlacklistService.blacklistToken(currentAccessToken, expiresIn);
        }
      }

      // Invalidate all tokens issued before now for this user
      await tokenBlacklistService.blacklistAllUserTokens(userId);

      // Revoke all refresh tokens
      await RefreshToken.update(
        {
          revoked: true,
          revoked_at: new Date()
        },
        {
          where: {
            user_id: userId,
            revoked: false
          }
        }
      );

      return { success: true };
    } catch (error) {
      console.error('Logout all error:', error);
      throw ApiError.internal('Çıkış yapılırken bir hata oluştu.');
    }
  }

  /**
   * Get active sessions for a user
   */
  async getActiveSessions(userId) {
    const sessions = await RefreshToken.findAll({
      where: {
        user_id: userId,
        revoked: false,
        expires_at: {
          [Op.gt]: new Date()
        }
      },
      attributes: ['id', 'device_info', 'ip_address', 'created_at', 'expires_at'],
      order: [['created_at', 'DESC']]
    });

    return sessions;
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(userId, sessionId) {
    const result = await RefreshToken.update(
      {
        revoked: true,
        revoked_at: new Date()
      },
      {
        where: {
          id: sessionId,
          user_id: userId,
          revoked: false
        }
      }
    );

    if (result[0] === 0) {
      throw ApiError.notFound('Oturum bulunamadı.');
    }

    return { success: true };
  }

  /**
   * Clean up expired refresh tokens (can be run periodically)
   */
  async cleanupExpiredTokens() {
    const result = await RefreshToken.destroy({
      where: {
        [Op.or]: [
          {
            expires_at: {
              [Op.lt]: new Date()
            }
          },
          {
            revoked: true,
            revoked_at: {
              [Op.lt]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days old revoked tokens
            }
          }
        ]
      }
    });

    return { deletedCount: result };
  }

  /**
   * Verify access token (used by middleware)
   */
  async verifyAccessToken(token) {
    // Check if token is blacklisted
    const isBlacklisted = await tokenBlacklistService.isBlacklisted(token);
    if (isBlacklisted) {
      throw ApiError.unauthorized('Token geçersiz kılınmış.');
    }

    // Verify JWT
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if all user tokens were invalidated
      const isInvalidated = await tokenBlacklistService.isUserTokenInvalidated(decoded.id, decoded.iat);
      if (isInvalidated) {
        throw ApiError.unauthorized('Tüm oturumlar sonlandırılmış. Lütfen tekrar giriş yapın.');
      }

      return decoded;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.unauthorized('Geçersiz token.');
    }
  }
}

module.exports = new AuthService();
