module.exports = {
  roots: ['<rootDir>/tests'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['app/**/*.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['html', 'text'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/app/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!msw|until-async)',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/tests/performance',
    '<rootDir>/tests/smoke',
  ],
};
