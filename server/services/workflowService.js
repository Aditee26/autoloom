const Workflow = require('../models/Workflow');
const ApiError = require('../utils/ApiError');
const { generateWebhookId } = require('../utils/crypto');
const { validateWorkflow } = require('./workflowEngine/validator');
const { TRIGGER_KIND } = require('./workflowEngine/nodeTypes');
const scheduler = require('./scheduler');

const SERVER_ONLY_KEYS = ['userId', '_id', 'webhookId', 'createdAt', 'updatedAt', '__v', 'status'];

/** Keep triggerType and webhookId consistent with the nodes on the canvas. */
function deriveFields(workflow) {
  const triggers = (workflow.nodes || []).filter((n) => TRIGGER_KIND[n.type]);
  workflow.triggerType = triggers.length === 1 ? TRIGGER_KIND[triggers[0].type] : 'none';
  if (workflow.triggerType === 'webhook' && !workflow.webhookId) workflow.webhookId = generateWebhookId();
}

function sanitizeNodes(nodes) {
  // Persist only what React Flow needs; drops transient UI keys such as `selected`, `measured`, `dragging`.
  return (nodes || []).map((n) => ({
    id: String(n.id),
    type: n.type,
    position: { x: Number(n.position?.x) || 0, y: Number(n.position?.y) || 0 },
    data: { label: String(n.data?.label ?? '').slice(0, 80), config: n.data?.config && typeof n.data.config === 'object' ? n.data.config : {} },
  }));
}

function sanitizeEdges(edges) {
  return (edges || []).map((e) => ({
    id: String(e.id), source: String(e.source), target: String(e.target),
    ...(e.sourceHandle ? { sourceHandle: String(e.sourceHandle) } : {}),
    ...(e.targetHandle ? { targetHandle: String(e.targetHandle) } : {}),
  }));
}

async function getOwned(id, userId) {
  const wf = await Workflow.findOne({ _id: id, userId });
  if (!wf) throw new ApiError(404, 'Workflow not found'); // 404 (not 403) so other users' ids are not revealed
  return wf;
}

function syncScheduler(workflow) {
  try {
    scheduler.register(workflow);
  } catch (err) {
    throw new ApiError(400, `Schedule could not be registered: ${err.message}`);
  }
}

module.exports = { deriveFields, sanitizeNodes, sanitizeEdges, getOwned, syncScheduler, validateWorkflow, SERVER_ONLY_KEYS };
