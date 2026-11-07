const Integration = require('../models/Integration');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { encrypt } = require('../utils/crypto');
const { validateUrlSyntax } = require('../utils/ssrf');

// Secrets are write-only: responses only say whether one is stored.
function serialize(doc, hasSecret) {
  const o = doc.toObject();
  return {
    id: o._id, name: o.name, type: o.type, configuration: o.configuration,
    hasSecret: hasSecret ?? Boolean(o.encryptedCredentials), lastUsedAt: o.lastUsedAt || null, createdAt: o.createdAt, updatedAt: o.updatedAt,
  };
}

function checkUrl(url) {
  try { validateUrlSyntax(url); } catch (e) { throw new ApiError(400, e.message); }
}

exports.list = asyncHandler(async (req, res) => {
  const docs = await Integration.find({ userId: req.user._id }).select('+encryptedCredentials').sort({ createdAt: -1 });
  res.json({ success: true, data: docs.map((d) => serialize(d)) });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, type, configuration, secret } = req.body;
  checkUrl(configuration.url);
  if (configuration.authType && configuration.authType !== 'none' && !secret) throw new ApiError(400, 'A secret is required for this authentication type');
  const doc = await Integration.create({
    userId: req.user._id, name, type: type || 'http',
    configuration: { url: configuration.url, method: configuration.method, headers: configuration.headers || [], authType: configuration.authType || 'none', apiKeyHeader: configuration.apiKeyHeader },
    encryptedCredentials: secret ? encrypt(secret) : undefined,
  });
  res.status(201).json({ success: true, data: serialize(doc, Boolean(secret)) });
});

exports.update = asyncHandler(async (req, res) => {
  const doc = await Integration.findOne({ _id: req.params.id, userId: req.user._id }).select('+encryptedCredentials');
  if (!doc) throw new ApiError(404, 'Integration not found');
  const { name, type, configuration, secret } = req.body;
  checkUrl(configuration.url);
  doc.name = name;
  if (type) doc.type = type;
  doc.configuration = { url: configuration.url, method: configuration.method, headers: configuration.headers || [], authType: configuration.authType || 'none', apiKeyHeader: configuration.apiKeyHeader };
  if (doc.configuration.authType === 'none') doc.encryptedCredentials = undefined;
  else if (secret) doc.encryptedCredentials = encrypt(secret); // omitted secret keeps the stored one
  else if (!doc.encryptedCredentials) throw new ApiError(400, 'A secret is required for this authentication type');
  await doc.save();
  res.json({ success: true, data: serialize(doc) });
});

exports.remove = asyncHandler(async (req, res) => {
  const doc = await Integration.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!doc) throw new ApiError(404, 'Integration not found');
  res.json({ success: true, message: 'Integration deleted' });
});
