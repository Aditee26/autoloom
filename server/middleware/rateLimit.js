const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';
const make = (windowMs, max, message) =>
  rateLimit({ windowMs, max: isTest ? 10000 : max, standardHeaders: true, legacyHeaders: false, message: { success: false, message } });

module.exports = {
  apiLimiter: make(15 * 60 * 1000, 600, 'Too many requests, please try again later'),
  authLimiter: make(15 * 60 * 1000, 30, 'Too many authentication attempts, please try again later'),
  webhookLimiter: make(60 * 1000, 120, 'Webhook rate limit exceeded'),
};
