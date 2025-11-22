// src/controllers/auth.controller.js
const authService = require('../services/auth.service');

class AuthController {
  /**
   * Get device info from request
   */
  getDeviceInfo(req) {
    const userAgent = req.headers['user-agent'] || 'Unknown';
    return userAgent.substring(0, 255); // Truncate to fit DB field
  }

  /**
   * Get IP address from request
   */
  getIpAddress(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.connection?.remoteAddress ||
           req.ip ||
           'Unknown';
  }

  /**
   * POST /api/v1/auth/register
   * Register a new user
   */
  async register(req, res, next) {
    try {
      const deviceInfo = this.getDeviceInfo(req);
      const ipAddress = this.getIpAddress(req);

      const result = await authService.register(req.body, deviceInfo, ipAddress);

      // Set refresh token as httpOnly cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.status(201).json({
        success: true,
        message: 'Kullanıcı başarıyla oluşturuldu!',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken, // Also in body for mobile apps
        user: result.user
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/login
   * Login user
   */
  async login(req, res, next) {
    try {
      console.log('🔐 Login isteği alındı:', req.body.email);

      const { email, password } = req.body;
      const deviceInfo = this.getDeviceInfo(req);
      const ipAddress = this.getIpAddress(req);

      const result = await authService.login(email, password, deviceInfo, ipAddress);

      console.log('✅ Login başarılı:', result.user.username);

      // Set refresh token as httpOnly cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.status(200).json({
        success: true,
        message: 'Giriş başarılı!',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken, // Also in body for mobile apps
        user: result.user
      });
    } catch (error) {
      console.error('❌ Login hatası:', error.message);
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/refresh
   * Refresh access token
   */
  async refresh(req, res, next) {
    try {
      // Get refresh token from cookie or body
      const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Yenileme tokeni bulunamadı.'
        });
      }

      const deviceInfo = this.getDeviceInfo(req);
      const ipAddress = this.getIpAddress(req);

      const result = await authService.refreshAccessToken(refreshToken, deviceInfo, ipAddress);

      // Update refresh token cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.status(200).json({
        success: true,
        message: 'Token yenilendi!',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user
      });
    } catch (error) {
      console.error('❌ Token refresh hatası:', error.message);
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/logout
   * Logout user (requires auth)
   */
  async logout(req, res, next) {
    try {
      const accessToken = req.token;
      const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

      await authService.logout(accessToken, refreshToken);

      // Clear refresh token cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });

      res.status(200).json({
        success: true,
        message: 'Başarıyla çıkış yapıldı.'
      });
    } catch (error) {
      console.error('❌ Logout hatası:', error.message);
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/logout-all
   * Logout from all devices (requires auth)
   */
  async logoutAll(req, res, next) {
    try {
      await authService.logoutAll(req.user.id, req.token);

      // Clear refresh token cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });

      res.status(200).json({
        success: true,
        message: 'Tüm cihazlardan çıkış yapıldı.'
      });
    } catch (error) {
      console.error('❌ Logout all hatası:', error.message);
      next(error);
    }
  }

  /**
   * GET /api/v1/auth/sessions
   * Get active sessions (requires auth)
   */
  async getSessions(req, res, next) {
    try {
      const sessions = await authService.getActiveSessions(req.user.id);

      res.status(200).json({
        success: true,
        sessions
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/auth/sessions/:sessionId
   * Revoke a specific session (requires auth)
   */
  async revokeSession(req, res, next) {
    try {
      const { sessionId } = req.params;
      await authService.revokeSession(req.user.id, sessionId);

      res.status(200).json({
        success: true,
        message: 'Oturum sonlandırıldı.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/auth/me
   * Get current user info (requires auth)
   */
  async me(req, res, next) {
    try {
      const user = req.user;

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          balance: user.balance,
          role: user.role,
          avatar_url: user.avatar_url,
          bio: user.bio,
          created_at: user.created_at
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
