const Execution = require('../models/Execution');
const Workflow = require('../models/Workflow');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { runWorkflow } = require('../services/executionService');
const { validateWorkflow } = require('../services/workflowEngine/validator');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.list = asyncHandler(async (req, res) => {
  const { status, workflowId, triggerType, search } = req.query;
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const filter = { userId: req.user._id };
  if (status) filter.status = status;
  if (workflowId) filter.workflowId = workflowId;
  if (triggerType) filter.triggerType = triggerType;
  if (search) {
    const rx = new RegExp(escapeRegex(String(search)), 'i');
    filter.$or = [{ workflowName: rx }];
    if (/^[a-f0-9]{24}$/i.test(search)) filter.$or.push({ _id: search });
  }
  const [items, total] = await Promise.all([
    Execution.find(filter).sort({ startedAt: -1 }).skip((page - 1) * limit).limit(limit).select('-nodeResults.input -nodeResults.output -executionContext -logs').lean(),
    Execution.countDocuments(filter),
  ]);
  res.json({ success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
});

exports.get = asyncHandler(async (req, res) => {
  const execution = await Execution.findOne({ _id: req.params.id, userId: req.user._id });
  if (!execution) throw new ApiError(404, 'Execution not found');
  res.json({ success: true, data: execution });
});

exports.retry = asyncHandler(async (req, res) => {
  const original = await Execution.findOne({ _id: req.params.id, userId: req.user._id });
  if (!original) throw new ApiError(404, 'Execution not found');
  if (!['failed', 'cancelled'].includes(original.status)) throw new ApiError(409, 'Only failed or cancelled executions can be retried');
  const workflow = await Workflow.findOne({ _id: original.workflowId, userId: req.user._id });
  if (!workflow) throw new ApiError(410, 'The workflow for this execution no longer exists');
  const validation = validateWorkflow(workflow);
  if (!validation.valid) throw new ApiError(422, 'Workflow is not valid', validation.errors);
  const execution = await runWorkflow({ workflow, triggerType: 'retry', input: original.input || {}, retryOf: original._id });
  res.status(201).json({ success: true, data: execution });
});

exports.cancel = asyncHandler(async (req, res) => {
  const owned = await Execution.findOne({ _id: req.params.id, userId: req.user._id }).select('status');
  if (!owned) throw new ApiError(404, 'Execution not found'); // identical response for "not yours" and "does not exist"
  const execution = await Execution.findOneAndUpdate(
    { _id: owned._id, userId: req.user._id, status: { $in: ['pending', 'running'] } },
    { status: 'cancelled' },
    { new: true }
  );
  if (!execution) throw new ApiError(409, 'Only pending or running executions can be cancelled');
  res.json({ success: true, data: execution });
});
