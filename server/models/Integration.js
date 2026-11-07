const mongoose = require('mongoose');

const integrationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    type: { type: String, enum: ['http', 'webhook'], default: 'http' },
    configuration: {
      url: { type: String, required: true, trim: true, maxlength: 2000 },
      method: { type: String, enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'POST' },
      headers: { type: [{ key: String, value: String, _id: false }], default: [] },
      authType: { type: String, enum: ['none', 'bearer', 'apiKey'], default: 'none' },
      apiKeyHeader: { type: String, trim: true, maxlength: 100, default: 'X-API-Key' },
    },
    encryptedCredentials: { type: String, select: false }, // AES-256-GCM payload; never returned by the API
    lastUsedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

integrationSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Integration', integrationSchema);
