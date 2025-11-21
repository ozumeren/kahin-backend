// tests/setup.js
// Set up test environment variables before any modules are loaded
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret-key';
process.env.PORT = '3001';

// Mock console to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
