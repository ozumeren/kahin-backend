// src/middlewares/error.middleware.js
const ApiError = require('../utils/apiError');

// Sequelize hatalarını ApiError'a çevir
const handleSequelizeError = (err) => {
  let message = err.message;
  
  // Unique constraint hatası
  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors[0]?.path || 'alan';
    message = `Bu ${field} zaten kullanılıyor.`;
    return ApiError.conflict(message);
  }
  
  // Validation hatası
  if (err.name === 'SequelizeValidationError') {
    message = err.errors.map(e => e.message).join(', ');
    return ApiError.badRequest(message);
  }
  
  // Foreign key hatası
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    message = 'İlişkili kayıt bulunamadı.';
    return ApiError.badRequest(message);
  }

  // Database connection hatası
  if (err.name === 'SequelizeConnectionError') {
    message = 'Veritabanı bağlantı hatası.';
    return ApiError.internal(message);
  }

  return null;
};

// JWT hatalarını ApiError'a çevir
const handleJWTError = (err) => {
  if (err.name === 'JsonWebTokenError') {
    return ApiError.unauthorized('Geçersiz token.');
  }
  
  if (err.name === 'TokenExpiredError') {
    return ApiError.unauthorized('Token süresi dolmuş.');
  }
  
  return null;
};

// Ana error handler middleware
const errorHandler = (err, req, res, next) => {
  let error = err;

  // Eğer hata zaten ApiError değilse, dönüştürmeyi dene
  if (!(error instanceof ApiError)) {
    // Sequelize hatalarını kontrol et
    const sequelizeError = handleSequelizeError(err);
    if (sequelizeError) {
      error = sequelizeError;
    }
    // JWT hatalarını kontrol et
    else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      error = handleJWTError(err);
    }
    // Diğer hatalar için generic ApiError oluştur
    else {
      const statusCode = err.statusCode || 500;
      const message = err.message || 'Bir hata oluştu';
      error = new ApiError(statusCode, message, false);
    }
  }

  // Hata logla
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error(`[ERROR] ${new Date().toISOString()}`);
  console.error(`Status: ${error.statusCode}`);
  console.error(`Message: ${error.message}`);
  console.error(`Path: ${req.method} ${req.originalUrl}`);
  
  if (process.env.NODE_ENV === 'development') {
    console.error(`Stack: ${error.stack}`);
  }
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Response formatı
  const response = {
    success: false,
    message: error.message,
    statusCode: error.statusCode
  };

  // Development ortamında daha fazla bilgi ver
  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
    response.originalError = err.message;
  }

  res.status(error.statusCode).json(response);
};

// 404 - Route bulunamadı middleware'i
const notFoundHandler = (req, res, next) => {
  const error = ApiError.notFound(`Route bulunamadı: ${req.method} ${req.originalUrl}`);
  next(error);
};

module.exports = { 
  errorHandler, 
  notFoundHandler 
};