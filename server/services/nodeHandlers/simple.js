const { LIMITS } = require('../workflowEngine/nodeTypes');
const { evaluateCondition } = require('../workflowEngine/conditions');
const { resolvePath, interpolate } = require('../workflowEngine/interpolate');

const ROOT_PATH = /^(trigger|nodes|variables|execution)(\.|\[)/;

async function triggerHandler({ context }) {
  return { output: context.trigger };
}

async function conditionHandler({ config, context }) {
  const rawField = String(config.field || '').trim();
  let actual;
  if (rawField.includes('{{')) actual = interpolate(rawField, context);
  else if (ROOT_PATH.test(rawField)) actual = resolvePath(context, rawField);
  else actual = rawField;
  const expected = typeof config.value === 'string' ? interpolate(config.value, context) : config.value;
  const result = evaluateCondition(config.operator, actual, expected);
  return {
    output: { result, field: rawField, operator: config.operator, actual, expected },
    branch: result ? 'true' : 'false',
  };
}

async function delayHandler({ config, deps }) {
  const seconds = Number(config.seconds);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > LIMITS.maxDelaySeconds) {
    throw new Error(`Delay must be between 0 and ${LIMITS.maxDelaySeconds} seconds`);
  }
  const wait = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  await wait(seconds * 1000);
  return { output: { waitedSeconds: seconds } };
}

function castValue(value, type) {
  switch (type) {
    case 'number': {
      const n = Number(value);
      if (Number.isNaN(n)) throw new Error(`Cannot convert "${value}" to a number`);
      return n;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      return ['true', '1', 'yes'].includes(String(value).toLowerCase());
    case 'json':
      if (typeof value !== 'string') return value;
      try { return JSON.parse(value); } catch { throw new Error('Value is not valid JSON'); }
    default:
      return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
  }
}

async function setVariableHandler({ config, context }) {
  const value = castValue(config.value, config.valueType || 'string');
  context.variables[config.name] = value;
  return { output: { name: config.name, value } };
}

async function logMessageHandler({ config, context }) {
  const entry = { level: config.level || 'info', message: String(config.message), at: new Date().toISOString() };
  context.logs.push(entry);
  return { output: entry };
}

module.exports = { triggerHandler, conditionHandler, delayHandler, setVariableHandler, logMessageHandler };
