// Safe {{path}} interpolation. No eval, no Function, no user code execution.
// Paths are resolved against a plain context object using own-property lookups only.
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const TEMPLATE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const SINGLE_TEMPLATE = /^\{\{\s*([^{}]+?)\s*\}\}$/;
const ALLOWED_ROOTS = new Set(['trigger', 'nodes', 'variables', 'execution']);

function parsePath(path) {
  const tokens = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m;
  while ((m = re.exec(path)) !== null) tokens.push(m[1] !== undefined ? m[1] : Number(m[2]));
  return tokens;
}

function resolvePath(context, path) {
  const tokens = parsePath(path);
  if (!tokens.length || !ALLOWED_ROOTS.has(tokens[0])) return undefined;
  let current = context;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    if (typeof token === 'string' && FORBIDDEN.has(token)) return undefined;
    if (typeof current !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, token)) return undefined;
    current = current[token];
  }
  return current;
}

function stringify(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function interpolateString(str, context) {
  const single = str.match(SINGLE_TEMPLATE);
  if (single) {
    const value = resolvePath(context, single[1]);
    return value === undefined ? '' : value; // keep original type for whole-value templates
  }
  return str.replace(TEMPLATE, (_, path) => stringify(resolvePath(context, path)));
}

function interpolate(value, context) {
  if (typeof value === 'string') return interpolateString(value, context);
  if (Array.isArray(value)) return value.map((v) => interpolate(v, context));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN.has(k)) continue;
      out[k] = interpolate(v, context);
    }
    return out;
  }
  return value;
}

module.exports = { interpolate, resolvePath };
