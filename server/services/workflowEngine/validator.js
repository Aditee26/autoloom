const { NODE_TYPES, TRIGGER_TYPES, HTTP_METHODS, LIMITS } = require('./nodeTypes');
const { OPERATORS, NO_VALUE_OPERATORS } = require('./conditions');
const { buildCronExpression } = require('./cron');
const { validateUrlSyntax } = require('../../utils/ssrf');

const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const hasTemplate = (s) => typeof s === 'string' && /\{\{.*\}\}/.test(s);

function validateNodeConfig(node) {
  const errors = [];
  const c = (node.data && node.data.config) || {};
  const label = (node.data && node.data.label) || node.id;
  const err = (msg) => errors.push(`${label}: ${msg}`);

  switch (node.type) {
    case 'scheduleTrigger':
      try { buildCronExpression(c); } catch (e) { err(e.message); }
      break;
    case 'condition':
      if (!c.field || !String(c.field).trim()) err('field is required');
      if (!OPERATORS.includes(c.operator)) err('a valid operator is required');
      else if (!NO_VALUE_OPERATORS.has(c.operator) && (c.value === undefined || c.value === null || c.value === '')) {
        err('comparison value is required for this operator');
      }
      break;
    case 'httpRequest': {
      const method = String(c.method || 'GET').toUpperCase();
      if (!HTTP_METHODS.includes(method)) err(`unsupported method ${c.method}`);
      if (!c.integrationId) {
        if (!c.url || !String(c.url).trim()) err('URL is required');
        else if (!hasTemplate(c.url)) {
          try { validateUrlSyntax(c.url); } catch (e) { err(e.message); }
        }
      }
      if (c.timeoutMs !== undefined && (!Number.isFinite(Number(c.timeoutMs)) || Number(c.timeoutMs) < 100 || Number(c.timeoutMs) > LIMITS.maxHttpTimeoutMs)) {
        err(`timeout must be between 100 and ${LIMITS.maxHttpTimeoutMs} ms`);
      }
      if (c.retries !== undefined && (!Number.isInteger(Number(c.retries)) || Number(c.retries) < 0 || Number(c.retries) > LIMITS.maxRetries)) {
        err(`retries must be between 0 and ${LIMITS.maxRetries}`);
      }
      if (typeof c.body === 'string' && c.body.trim() && !hasTemplate(c.body)) {
        try { JSON.parse(c.body); } catch { err('request body must be valid JSON'); }
      }
      break;
    }
    case 'delay': {
      const s = Number(c.seconds);
      if (!Number.isFinite(s) || s < 0 || s > LIMITS.maxDelaySeconds) err(`delay must be between 0 and ${LIMITS.maxDelaySeconds} seconds`);
      break;
    }
    case 'setVariable':
      if (!c.name || !VAR_NAME.test(String(c.name))) err('variable name must be letters, numbers and underscores (not starting with a number)');
      break;
    case 'logMessage':
      if (!c.message || !String(c.message).trim()) err('message is required');
      break;
    default:
      break;
  }
  return errors;
}

/** Validate a workflow definition. Returns { valid, errors, triggerNode }. */
function validateWorkflow(workflow) {
  const errors = [];
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];

  if (nodes.length === 0) return { valid: false, errors: ['Workflow has no nodes'], triggerNode: null };
  if (nodes.length > LIMITS.maxNodesPerWorkflow) errors.push(`Workflow cannot exceed ${LIMITS.maxNodesPerWorkflow} nodes`);

  const ids = new Set();
  for (const n of nodes) {
    if (!n.id) { errors.push('A node is missing an id'); continue; }
    if (ids.has(n.id)) errors.push(`Duplicate node id: ${n.id}`);
    ids.add(n.id);
    if (!NODE_TYPES.includes(n.type)) errors.push(`Unsupported node type "${n.type}" (${n.id})`);
  }

  const triggers = nodes.filter((n) => TRIGGER_TYPES.includes(n.type));
  if (triggers.length === 0) errors.push('Workflow must have exactly one trigger node (found none)');
  if (triggers.length > 1) errors.push(`Workflow must have exactly one trigger node (found ${triggers.length})`);
  const triggerNode = triggers[0] || null;

  const outgoing = new Map();
  const incoming = new Map();
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      errors.push(`Connection ${e.id || ''} references a missing node`);
      continue;
    }
    if (e.source === e.target) errors.push('A node cannot connect to itself');
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source).push(e);
    incoming.set(e.target, (incoming.get(e.target) || 0) + 1);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const src = byId.get(e.source);
    const tgt = byId.get(e.target);
    if (!src || !tgt) continue;
    if (TRIGGER_TYPES.includes(tgt.type)) errors.push('Trigger nodes cannot have incoming connections');
    if (src.type === 'condition' && !['true', 'false'].includes(e.sourceHandle)) {
      errors.push(`Condition "${src.data?.label || src.id}" connections must use the TRUE or FALSE output`);
    }
    if (src.type !== 'condition' && e.sourceHandle && !['out', 'output'].includes(e.sourceHandle)) {
      errors.push(`Unexpected output handle on "${src.data?.label || src.id}"`);
    }
  }

  // Cycle detection (iterative DFS with colouring)
  const colour = new Map();
  let cyclic = false;
  for (const n of nodes) {
    if (colour.get(n.id)) continue;
    const stack = [[n.id, 0]];
    colour.set(n.id, 1);
    while (stack.length && !cyclic) {
      const frame = stack[stack.length - 1];
      const next = (outgoing.get(frame[0]) || [])[frame[1]++];
      if (!next) { colour.set(frame[0], 2); stack.pop(); continue; }
      const c = colour.get(next.target);
      if (c === 1) cyclic = true;
      else if (!c) { colour.set(next.target, 1); stack.push([next.target, 0]); }
    }
    if (cyclic) break;
  }
  if (cyclic) errors.push('Workflow contains a cycle; loops are not supported');

  // Reachability from the trigger
  if (triggerNode && !cyclic) {
    const reached = new Set([triggerNode.id]);
    const queue = [triggerNode.id];
    while (queue.length) {
      for (const e of outgoing.get(queue.shift()) || []) {
        if (!reached.has(e.target)) { reached.add(e.target); queue.push(e.target); }
      }
    }
    for (const n of nodes) {
      if (!reached.has(n.id)) errors.push(`"${n.data?.label || n.id}" is not connected to the trigger`);
    }
    if (!(outgoing.get(triggerNode.id) || []).length) errors.push('The trigger must connect to at least one node');
  }

  for (const n of nodes) errors.push(...validateNodeConfig(n));

  return { valid: errors.length === 0, errors, triggerNode };
}

module.exports = { validateWorkflow, validateNodeConfig };
