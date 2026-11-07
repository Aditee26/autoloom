const Template = require('../models/Template');
const Workflow = require('../models/Workflow');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const svc = require('../services/workflowService');
const { serialize } = require('./workflowController');

exports.list = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await Template.find().sort({ name: 1 }).select('-nodes -edges').lean() });
});

exports.get = asyncHandler(async (req, res) => {
  const t = await Template.findById(req.params.id).lean();
  if (!t) throw new ApiError(404, 'Template not found');
  res.json({ success: true, data: t });
});

exports.clone = asyncHandler(async (req, res) => {
  const t = await Template.findById(req.params.id).lean();
  if (!t) throw new ApiError(404, 'Template not found');
  const wf = new Workflow({
    userId: req.user._id,
    name: (req.body.name || t.name).toString().slice(0, 120),
    description: t.description,
    nodes: JSON.parse(JSON.stringify(t.nodes)),
    edges: JSON.parse(JSON.stringify(t.edges)),
    status: 'inactive',
  });
  svc.deriveFields(wf);
  await wf.save();
  res.status(201).json({ success: true, data: serialize(wf) });
});
