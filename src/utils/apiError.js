// src/utils/apiError.js

class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational; // Kullanıcıya gösterilebilir hata mı?
    
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  // Önceden tanımlı hata tipleri
  static badRequest(message = 'Geçersiz istek') {
    return new ApiError(400, message);
  }

  static unauthorized(message = 'Yetkilendirme başarısız') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Erişim reddedildi') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Kaynak bulunamadı') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Veri çakışması') {
    return new ApiError(409, message);
  }

  static tooManyRequests(message = 'Çok fazla istek') {
    return new ApiError(429, message);
  }

  static internal(message = 'Sunucu hatası') {
    return new ApiError(500, message, false); // Kullanıcıya detay gösterme
  }
}

module.exports = ApiError;