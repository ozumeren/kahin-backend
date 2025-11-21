module.exports = {
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/models/index.js'
  ],
  setupFiles: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  verbose: true
};
