const cron = require('node-cron');
const Workflow = require('../../models/Workflow');
const { runWorkflow } = require('../executionService');
const { buildCronExpression } = require('../workflowEngine/cron');
const { validateWorkflow } = require('../workflowEngine/validator');

// workflowId -> { task, expression }. One entry per workflow guarantees no duplicate jobs.
const jobs = new Map();
const running = new Set(); // overlap guard: skip a tick while the previous run is still going

function stop(workflowId) {
  const key = String(workflowId);
  const job = jobs.get(key);
  if (job) { job.task.stop(); jobs.delete(key); }
  return Boolean(job);
}

function scheduleConfig(workflow) {
  const trigger = (workflow.nodes || []).find((n) => n.type === 'scheduleTrigger');
  return trigger ? (trigger.data && trigger.data.config) || {} : null;
}

/** (Re)register a workflow. Always stops any existing job first. Returns the cron expression or null. */
function register(workflow) {
  const key = String(workflow._id);
  stop(key);
  if (workflow.status !== 'active' || workflow.triggerType !== 'schedule') return null;
  const config = scheduleConfig(workflow);
  if (!config) return null;
  const expression = buildCronExpression(config);
  const task = cron.schedule(expression, async () => {
    if (running.has(key)) { console.warn(`[scheduler] skipping overlapping run for workflow ${key}`); return; }
    running.add(key);
    try {
      const fresh = await Workflow.findById(key);
      if (!fresh || fresh.status !== 'active') { stop(key); return; }
      if (!validateWorkflow(fresh).valid) { console.warn(`[scheduler] workflow ${key} is invalid; skipping`); return; }
      await runWorkflow({ workflow: fresh, triggerType: 'schedule', input: { body: {} } });
    } catch (err) {
      console.error(`[scheduler] run failed for workflow ${key}:`, err.message);
    } finally {
      running.delete(key);
    }
  });
  jobs.set(key, { task, expression });
  return expression;
}

async function init() {
  const workflows = await Workflow.find({ status: 'active', triggerType: 'schedule' });
  let count = 0;
  for (const wf of workflows) {
    try { if (register(wf)) count += 1; } catch (err) { console.error(`[scheduler] could not register ${wf._id}: ${err.message}`); }
  }
  console.log(`[scheduler] registered ${count} scheduled workflow(s)`);
}

function stopAll() { for (const id of [...jobs.keys()]) stop(id); }
const isRegistered = (id) => jobs.has(String(id));
const size = () => jobs.size;
const expressionFor = (id) => (jobs.get(String(id)) || {}).expression;

module.exports = { register, stop, init, stopAll, isRegistered, size, expressionFor };
