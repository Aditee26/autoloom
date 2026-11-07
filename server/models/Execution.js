const mongoose = require('mongoose');

const nodeResultSchema = new mongoose.Schema(
  {
    nodeId: String,
    nodeType: String,
    label: String,
    status: { type: String, enum: ['running', 'success', 'failed', 'skipped'] },
    branch: String,
    startedAt: Date,
    completedAt: Date,
    duration: Number,
    input: mongoose.Schema.Types.Mixed,
    output: mongoose.Schema.Types.Mixed,
    error: String,
  },
  { _id: false }
);

const executionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true },
    workflowName: { type: String, required: true }, // snapshot so history survives workflow deletion/rename
    status: { type: String, enum: ['pending', 'running', 'success', 'failed', 'cancelled'], default: 'pending' },
    triggerType: { type: String, enum: ['manual', 'webhook', 'schedule', 'retry'], required: true },
    retryOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Execution' },
    input: mongoose.Schema.Types.Mixed,
    nodeResults: { type: [nodeResultSchema], default: [] },
    executionContext: mongoose.Schema.Types.Mixed,
    logs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
    duration: Number,
    error: { message: String, nodeId: String },
  },
  { timestamps: false }
);

executionSchema.index({ userId: 1, startedAt: -1 });
executionSchema.index({ userId: 1, workflowId: 1, startedAt: -1 });
executionSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Execution', executionSchema);
