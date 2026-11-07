require('dotenv').config();

const required = ['JWT_SECRET', 'ENCRYPTION_KEY'];

function loadEnv() {
  const isTest = process.env.NODE_ENV === 'test';
  const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '5000', 10),
    mongoUri: isTest
      ? process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/autoloom_test'
      : process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/autoloom',
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    encryptionKey: process.env.ENCRYPTION_KEY,
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    publicApiUrl: process.env.PUBLIC_API_URL || 'http://localhost:5000',
    allowPrivateHttp: process.env.ALLOW_PRIVATE_HTTP === 'true' && isTest, // only ever honoured in tests
    schedulerEnabled: process.env.SCHEDULER_ENABLED !== 'false',
  };
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if (env.encryptionKey.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
  }
  return env;
}

module.exports = loadEnv();
