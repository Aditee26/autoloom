// Client-side mirror of the server's structural validation, used for instant editor feedback.
// The server remains the source of truth and re-validates on save, activate and execute.
import { NODE_DEFS, OPERATORS, NO_VALUE_OPERATORS, HTTP_METHODS, MAX_DELAY_SECONDS, isTrigger } from './nodeDefs';

const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const hasTemplate = (s) => typeof s === 'string' && /\{\{.*\}\}/.test(s);

function configErrors(node) {
  const c = node.data?.config || {};
  const errs = [];
  switch (node.type) {
    case 'scheduleTrigger':
      if (c.mode === 'custom' && !String(c.cron || '').trim()) errs.push('Cron expression is required');
      if (c.mode === 'custom' && String(c.cron || '').trim() && String(c.cron).trim().split(/\s+/).length < 5) errs.push('Cron expression needs at least 5 fields');
      break;
    case 'condition':
      if (!String(c.field || '').trim()) errs.push('Field is required');
      if (!OPERATORS.some((o) => o.value === c.operator)) errs.push('Choose an operator');
      else if (!NO_VALUE_OPERATORS.includes(c.operator) && (c.value === undefined || c.value === null || c.value === '')) errs.push('Comparison value is required');
      break;
    case 'httpRequest':
      if (!c.integrationId) {
        if (!String(c.url || '').trim()) errs.push('URL is required');
        else if (!hasTemplate(c.url) && !/^https?:\/\//i.test(c.url)) errs.push('URL must start with http:// or https://');
      }
      if (!HTTP_METHODS.includes(String(c.method || 'GET').toUpperCase())) errs.push('Unsupported method');
      if (typeof c.body === 'string' && c.body.trim() && !hasTemplate(c.body)) { try { JSON.parse(c.body); } catch { errs.push('Body must be valid JSON'); } }
      break;
    case 'delay':
      if (!(Number(c.seconds) >= 0 && Number(c.seconds) <= MAX_DELAY_SECONDS)) errs.push(`Delay must be 0–${MAX_DELAY_SECONDS} seconds`);
      break;
    case 'setVariable':
      if (!VAR_NAME.test(String(c.name || ''))) errs.push('Variable name must be letters, numbers and underscores');
      break;
    case 'logMessage':
      if (!String(c.message || '').trim()) errs.push('Message is required');
      break;
    default: break;
  }
  return errs;
}

/** @returns {{valid:boolean, errors:string[], nodeErrors:Record<string,string[]>}} */
export function validateWorkflow(nodes, edges) {
  const errors = [];
  const nodeErrors = {};
  const addNodeError = (id, msg, label) => { (nodeErrors[id] ||= []).push(msg); errors.push(`${label}: ${msg}`); };

  if (!nodes.length) return { valid: false, errors: ['Add a trigger node to get started'], nodeErrors };
  const triggers = nodes.filter((n) => isTrigger(n.type));
  if (triggers.length === 0) errors.push('Add exactly one trigger node');
  if (triggers.length > 1) errors.push(`Only one trigger is allowed (found ${triggers.length})`);

  const ids = new Set(nodes.map((n) => n.id));
  const out = new Map();
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) { errors.push('A connection points to a missing node'); continue; }
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source).push(e.target);
    const target = nodes.find((n) => n.id === e.target);
    if (isTrigger(target.type)) errors.push('Trigger nodes cannot have incoming connections');
  }

  // cycle detection
  const color = new Map();
  let cyclic = false;
  const visit = (id) => {
    color.set(id, 1);
    for (const t of out.get(id) || []) {
      if (color.get(t) === 1) cyclic = true;
      else if (!color.get(t)) visit(t);
      if (cyclic) return;
    }
    color.set(id, 2);
  };
  for (const n of nodes) { if (!color.get(n.id)) visit(n.id); if (cyclic) break; }
  if (cyclic) errors.push('Loops are not supported: the workflow contains a cycle');

  if (triggers.length === 1 && !cyclic) {
    const seen = new Set([triggers[0].id]);
    const q = [triggers[0].id];
    while (q.length) for (const t of out.get(q.shift()) || []) if (!seen.has(t)) { seen.add(t); q.push(t); }
    if (!(out.get(triggers[0].id) || []).length) addNodeError(triggers[0].id, 'Connect the trigger to at least one node', triggers[0].data?.label || triggers[0].id);
    for (const n of nodes) if (!seen.has(n.id)) addNodeError(n.id, 'Not connected to the trigger', n.data?.label || n.id);
  }

  for (const n of nodes) {
    if (!NODE_DEFS[n.type]) { addNodeError(n.id, `Unknown node type ${n.type}`, n.id); continue; }
    configErrors(n).forEach((m) => addNodeError(n.id, m, n.data?.label || n.id));
    if (n.type === 'condition') {
      const handles = new Set(edges.filter((e) => e.source === n.id).map((e) => e.sourceHandle));
      if (!handles.has('true') && !handles.has('false')) addNodeError(n.id, 'Connect at least one of TRUE / FALSE', n.data?.label || n.id);
    }
  }
  return { valid: errors.length === 0, errors, nodeErrors };
}

/** Would adding source→target create a cycle? */
export function wouldCreateCycle(edges, source, target) {
  if (source === target) return true;
  const adj = new Map();
  edges.forEach((e) => { if (!adj.has(e.source)) adj.set(e.source, []); adj.get(e.source).push(e.target); });
  const stack = [target];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (id === source) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    (adj.get(id) || []).forEach((t) => stack.push(t));
  }
  return false;
}
