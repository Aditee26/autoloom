// Pure execution core: no database access. Persistence is injected via callbacks,
// which makes the engine fully unit-testable.
const handlers = require('../nodeHandlers');
const { describeInput } = require('../nodeHandlers/httpRequest');
const { validateWorkflow } = require('./validator');
const { interpolate } = require('./interpolate');
const { LIMITS, TRIGGER_KIND } = require('./nodeTypes');

const SENSITIVE_TRIGGER_HEADERS = ['authorization', 'cookie', 'x-api-key', 'proxy-authorization'];

function maskHeaders(headers = {}) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) out[k] = SENSITIVE_TRIGGER_HEADERS.includes(k.toLowerCase()) ? '********' : v;
  return out;
}

/** Copy of a trigger input that is safe to persist (sensitive headers masked). */
function sanitizeTriggerInput(input) {
  if (!input || typeof input !== 'object' || !input.headers) return input;
  return { ...input, headers: maskHeaders(input.headers) };
}

function buildTrigger(kind, input = {}) {
  const timestamp = new Date().toISOString();
  if (kind === 'webhook') {
    const headers = maskHeaders(input.headers || {});
    return { type: 'webhook', method: input.method || 'POST', headers, query: input.query || {}, body: input.body ?? {}, timestamp };
  }
  return { type: kind, body: input.body ?? input ?? {}, timestamp };
}

/** Interpolate a node's config. For HTTP bodies, parse JSON first so substituted values can't break JSON syntax. */
function prepareConfig(node, context) {
  const raw = { ...((node.data && node.data.config) || {}) };
  if (node.type === 'httpRequest' && typeof raw.body === 'string' && raw.body.trim()) {
    try {
      raw.body = JSON.parse(raw.body);
    } catch {
      raw.body = interpolate(raw.body, context);
      try { raw.body = JSON.parse(raw.body); } catch { throw new Error('Request body is not valid JSON after variable substitution'); }
      const { body, ...rest } = raw;
      return { ...interpolate(rest, context), body };
    }
  }
  return interpolate(raw, context);
}

function recordedInput(node, config) {
  if (node.type === 'httpRequest') return describeInput(config);
  if (node.type === 'scheduleTrigger' || node.type === 'manualTrigger' || node.type === 'webhookTrigger') return undefined;
  return config;
}

async function runGraph({ workflow, userId, executionId, triggerInput, deps = {}, onNodeResult, shouldCancel }) {
  const validation = validateWorkflow(workflow);
  const startedAt = new Date();
  const triggerNode = validation.triggerNode;
  if (!validation.valid) {
    return {
      status: 'failed', nodeResults: [], logs: [], variables: {},
      error: { message: `Workflow validation failed: ${validation.errors.join('; ')}`, nodeId: null },
      startedAt, completedAt: new Date(),
    };
  }

  const kind = TRIGGER_KIND[triggerNode.type];
  const context = {
    trigger: buildTrigger(deps.triggerKind || kind, triggerInput),
    variables: {},
    nodes: {},
    execution: { id: String(executionId || ''), workflowId: String(workflow._id || workflow.id || ''), startedAt: startedAt.toISOString() },
    userId,
    logs: [],
  };
  // userId is kept off the interpolation surface: templates only reach trigger/nodes/variables/execution roots.

  const byId = new Map(workflow.nodes.map((n) => [n.id, n]));
  const outgoing = new Map();
  for (const e of workflow.edges || []) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source).push(e);
  }

  const nodeResults = [];
  const executed = new Set();
  const queue = [triggerNode.id];
  let executions = 0;
  let status = 'success';
  let error = null;

  while (queue.length) {
    const nodeId = queue.shift();
    if (executed.has(nodeId)) continue;

    if (shouldCancel && (await shouldCancel())) { status = 'cancelled'; error = { message: 'Execution was cancelled', nodeId: null }; break; }
    if (Date.now() - startedAt.getTime() > LIMITS.maxWorkflowRuntimeMs) {
      status = 'failed'; error = { message: `Execution exceeded the ${LIMITS.maxWorkflowRuntimeMs / 1000}s runtime limit`, nodeId }; break;
    }
    executions += 1;
    if (executions > LIMITS.maxNodeExecutions) {
      status = 'failed'; error = { message: `Exceeded maximum of ${LIMITS.maxNodeExecutions} node executions`, nodeId }; break;
    }

    const node = byId.get(nodeId);
    executed.add(nodeId);
    const nodeStart = new Date();
    const result = {
      nodeId, nodeType: node.type, label: node.data?.label || node.type, status: 'running', startedAt: nodeStart,
    };
    let config = {};
    try {
      config = prepareConfig(node, context);
      result.input = recordedInput(node, config);
      const handler = handlers[node.type];
      if (!handler) throw new Error(`No handler for node type ${node.type}`);
      const out = await handler({ node, config, context, deps: { ...deps, userId } });
      result.status = 'success';
      result.output = out.output;
      context.nodes[nodeId] = out.output;
      if (node.data?.label) context.nodes[node.data.label.replace(/[^A-Za-z0-9_]/g, '_')] ??= out.output;

      const edges = outgoing.get(nodeId) || [];
      const next = node.type === 'condition' ? edges.filter((e) => e.sourceHandle === out.branch) : edges;
      if (node.type === 'condition') result.branch = out.branch;
      next.forEach((e) => queue.push(e.target));
    } catch (err) {
      result.status = 'failed';
      result.error = err.message;
      if (err.output) result.output = err.output;
      status = 'failed';
      error = { message: `Node "${result.label}" failed: ${err.message}`, nodeId };
    }
    result.completedAt = new Date();
    result.duration = result.completedAt - nodeStart;
    nodeResults.push(result);
    if (onNodeResult) await onNodeResult(result);
    if (status === 'failed') break;
  }

  const { userId: _omit, ...publicContext } = context;
  return { status, nodeResults, logs: context.logs, variables: context.variables, context: publicContext, error, startedAt, completedAt: new Date() };
}

module.exports = { runGraph, buildTrigger, prepareConfig, sanitizeTriggerInput };
