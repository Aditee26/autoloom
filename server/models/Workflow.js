const mongoose = require('mongoose');

const workflowSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    nodes: { type: [mongoose.Schema.Types.Mixed], default: [] },
    edges: { type: [mongoose.Schema.Types.Mixed], default: [] },
    viewport: { type: mongoose.Schema.Types.Mixed, default: undefined },
    status: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
    triggerType: { type: String, enum: ['none', 'manual', 'webhook', 'schedule'], default: 'none' },
    webhookId: { type: String, unique: true, sparse: true },
    settings: {
      timeoutMs: { type: Number, min: 1000, max: 120000, default: 120000 },
    },
  },
  { timestamps: true }
);

workflowSchema.index({ userId: 1, updatedAt: -1 });
workflowSchema.index({ userId: 1, status: 1 });
workflowSchema.index({ userId: 1, name: 'text' });

module.exports = mongoose.model('Workflow', workflowSchema);
