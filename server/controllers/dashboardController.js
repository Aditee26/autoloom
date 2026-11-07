const Workflow = require('../models/Workflow');
const Execution = require('../models/Execution');
const asyncHandler = require('../utils/asyncHandler');

exports.stats = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const [wfCounts, exCounts, recentWorkflows, recentExecutions] = await Promise.all([
    Workflow.aggregate([{ $match: { userId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Execution.aggregate([{ $match: { userId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Workflow.find({ userId }).sort({ updatedAt: -1 }).limit(5).select('name description status updatedAt triggerType').lean(),
    Execution.find({ userId }).sort({ startedAt: -1 }).limit(8).select('workflowId workflowName status triggerType startedAt completedAt duration').lean(),
  ]);
  const w = Object.fromEntries(wfCounts.map((r) => [r._id, r.n]));
  const e = Object.fromEntries(exCounts.map((r) => [r._id, r.n]));
  const totalExecutions = exCounts.reduce((s, r) => s + r.n, 0);
  const success = e.success || 0;
  const failed = e.failed || 0;
  const finished = success + failed;

  const perWorkflow = await Execution.aggregate([
    { $match: { userId, workflowId: { $in: recentWorkflows.map((r) => r._id) } } },
    { $group: { _id: '$workflowId', total: { $sum: 1 }, lastExecutedAt: { $max: '$startedAt' } } },
  ]);
  const pw = new Map(perWorkflow.map((r) => [String(r._id), r]));

  res.json({
    success: true,
    data: {
      workflows: { total: (w.active || 0) + (w.inactive || 0), active: w.active || 0, inactive: w.inactive || 0 },
      executions: { total: totalExecutions, success, failed, running: e.running || 0, cancelled: e.cancelled || 0, successRate: finished ? Math.round((success / finished) * 1000) / 10 : null },
      recentWorkflows: recentWorkflows.map((r) => ({ ...r, id: r._id, totalExecutions: pw.get(String(r._id))?.total || 0, lastExecutedAt: pw.get(String(r._id))?.lastExecutedAt || null })),
      recentExecutions: recentExecutions.map((r) => ({ ...r, id: r._id })),
    },
  });
});

exports.analytics = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days || '14', 10) || 14, 1), 90);
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const rows = await Execution.aggregate([
    { $match: { userId: req.user._id, startedAt: { $gte: start } } },
    { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt', timezone: 'UTC' } }, status: '$status', workflowId: '$workflowId' }, n: { $sum: 1 } } },
  ]);

  const buckets = new Map();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start); d.setUTCDate(start.getUTCDate() + i);
    buckets.set(d.toISOString().slice(0, 10), { date: d.toISOString().slice(0, 10), total: 0, success: 0, failed: 0, workflows: new Set() });
  }
  const perWorkflow = new Map();
  for (const r of rows) {
    const b = buckets.get(r._id.day);
    if (!b) continue;
    b.total += r.n;
    if (r._id.status === 'success') b.success += r.n;
    if (r._id.status === 'failed') b.failed += r.n;
    b.workflows.add(String(r._id.workflowId));
    perWorkflow.set(String(r._id.workflowId), (perWorkflow.get(String(r._id.workflowId)) || 0) + r.n);
  }
  const names = await Workflow.find({ _id: { $in: [...perWorkflow.keys()] }, userId: req.user._id }).select('name').lean();
  const nameOf = new Map(names.map((n) => [String(n._id), n.name]));

  res.json({
    success: true,
    data: {
      days,
      daily: [...buckets.values()].map(({ workflows, ...b }) => ({ ...b, activeWorkflows: workflows.size })),
      topWorkflows: [...perWorkflow.entries()].map(([id, n]) => ({ workflowId: id, name: nameOf.get(id) || 'Deleted workflow', executions: n })).sort((a, b) => b.executions - a.executions).slice(0, 5),
    },
  });
});
