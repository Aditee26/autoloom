const crypto = require('crypto');
const env = require('../config/env');

// AES-256-GCM with a key derived from the server-side ENCRYPTION_KEY.
const key = () => crypto.createHash('sha256').update(env.encryptionKey).digest();

function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

function decrypt(payload) {
  const [iv, tag, data] = String(payload).split('.');
  if (!iv || !tag || !data) throw new Error('Malformed encrypted payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

const generateWebhookId = () => crypto.randomBytes(24).toString('hex'); // 48 hex chars
const WEBHOOK_ID_REGEX = /^[a-f0-9]{48}$/;

module.exports = { encrypt, decrypt, generateWebhookId, WEBHOOK_ID_REGEX };
