const Workflow = require('../models/Workflow');
const Execution = require('../models/Execution');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const { generateWebhookId } = require('../utils/crypto');
const svc = require('../services/workflowService');
const scheduler = require('../services/scheduler');
const { runWorkflow } = require('../services/executionService');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function serialize(wf, extra = {}) {
  const o = wf.toObject ? wf.toObject() : wf;
  return {
    id: o._id, name: o.name, description: o.description, nodes: o.nodes, edges: o.edges, viewport: o.viewport,
    status: o.status, triggerType: o.triggerType, settings: o.settings,
    webhookId: o.webhookId, webhookUrl: o.webhookId ? `${env.publicApiUrl}/api/webhooks/${o.webhookId}` : undefined,
    createdAt: o.createdAt, updatedAt: o.updatedAt, ...extra,
  };
}

async function execStats(userId, ids) {
  const rows = await Execution.aggregate([
    { $match: { userId, workflowId: { $in: ids } } },
    { $group: { _id: '$workflowId', total: { $sum: 1 }, lastExecutedAt: { $max: '$startedAt' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

exports.list = asyncHandler(async (req, res) => {
  const { status, search, sort = 'updated' } = req.query;
  const filter = { userId: req.user._id };
  if (status) filter.status = status;
  if (search) { const rx = new RegExp(escapeRegex(String(search)), 'i'); filter.$or = [{ name: rx }, { description: rx }]; }
  const sortBy = { updated: { updatedAt: -1 }, name: { name: 1 }, created: { createdAt: -1 } }[sort];
  const workflows = await Workflow.find(filter).sort(sortBy).select('-nodes.data.config').lean(); // listing needn't ship full configs
  const stats = await execStats(req.user._id, workflows.map((w) => w._id));
  res.json({
    success: true,
    data: workflows.map((w) => serialize(w, { totalExecutions: stats.get(String(w._id))?.total || 0, lastExecutedAt: stats.get(String(w._id))?.lastExecutedAt || null, nodeCount: w.nodes.length })),
  });
});

exports.create = asyncHandler(async (req, res) => {
  const wf = new Workflow({
    userId: req.user._id, name: req.body.name, description: req.body.description || '',
    nodes: svc.sanitizeNodes(req.body.nodes), edges: svc.sanitizeEdges(req.body.edges),
  });
  svc.deriveFields(wf);
  await wf.save();
  res.status(201).json({ success: true, data: serialize(wf) });
});

exports.get = asyncHandler(async (req, res) => {
  const wf = await svc.getOwned(req.params.id, req.user._id);
  res.json({ success: true, data: serialize(wf, { validation: svc.validateWorkflow(wf) }) });
});

exports.update = asyncHandler(async (req, res) => {
  const wf = await svc.getOwned(req.params.id, req.user._id);
  const { name, description, nodes, edges, viewport } = req.body;
  if (name !== undefined) wf.name = name;
  if (description !== undefined) wf.description = description;
  if (nodes !== undefined) wf.nodes = svc.sanitizeNodes(nodes);
  if (edges !== undefined) wf.edges = svc.sanitizeEdges(edges);
  if (viewport !== undefined) wf.viewport = viewport;
  svc.deriveFields(wf);
  const validation = svc.validateWorkflow(wf);
  // An active workflow that becomes invalid is deactivated rather than left to fail silently.
  if (wf.status === 'active' && !validation.valid) wf.status = 'inactive';
  await wf.save();
  svc.syncScheduler(wf);
  res.json({ success: true, data: serialize(wf, { validation }) });
});

exports.remove = asyncHandler(async (req, res) => {
  const wf = await svc.getOwned(req.params.id, req.user._id);
  scheduler.stop(wf._id);
  await wf.deleteOne();
  res.json({ success: true, message: 'Workflow deleted' });
});

exports.duplicate = asyncHandler(async (req, res) => {
  const src = await svc.getOwned(req.params.id, req.user._id);
  const copy = new Workflow({
    userId: req.user._id, name: `${src.name} (Copy)`.slice(0, 120), description: src.description,
    nodes: JSON.parse(JSON.stringify(src.nodes)), edges: JSON.parse(JSON.stringify(src.edges)), viewport: src.viewport, status: 'inactive',
  });
  svc.deriveFields(copy);
  if (copy.triggerType === 'webhook') copy.webhookId = generateWebhookId(); // never share a webhook URL between workflows
  await copy.save();
  res.status(201).json({ success: true, data: serialize(copy) });
});

exports.setStatus = asyncHandler(async (req, res) => {
  const wf = await svc.getOwned(req.params.id, req.user._id);
  if (req.body.status === 'active') {
    const validation = svc.validateWorkflow(wf);
    if (!validation.valid) throw new ApiError(422, 'Fix the workflow validation errors before activating', validation.errors);
    if (wf.triggerType === 'manual') throw new ApiError(422, 'Manual-trigger workflows run on demand and cannot be activated; use Test/Run instead');
  }
  wf.status = req.body.status;
  await wf.save();
  svc.syncScheduler(wf);
  res.json({ success: true, data: serialize(wf, { scheduled: scheduler.isRegistered(wf._id), cron: scheduler.expressionFor(wf._id) }) });
});

exports.execute = asyncHandler(async (req, res) => {
  const wf = await svc.getOwned(req.params.id, req.user._id);
  const validation = svc.validateWorkflow(wf);
  if (!validation.valid) throw new ApiError(422, 'Workflow is not valid', validation.errors);
  const input = { body: req.body.input === undefined ? {} : req.body.input };
  const execution = await runWorkflow({ workflow: wf, triggerType: 'manual', input });
  res.status(201).json({ success: true, data: execution });
});

exports.serialize = serialize;
