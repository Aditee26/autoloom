const Execution = require('../models/Execution');
const Integration = require('../models/Integration');
const User = require('../models/User');
const { runGraph, sanitizeTriggerInput } = require('./workflowEngine/runner');
const { decrypt } = require('../utils/crypto');

async function loadIntegration(userId, integrationId) {
  const doc = await Integration.findOne({ _id: integrationId, userId }).select('+encryptedCredentials');
  if (!doc) return null;
  Integration.updateOne({ _id: doc._id }, { lastUsedAt: new Date() }).catch((e) => console.error('[integration] lastUsedAt update failed', e.message));
  return {
    url: doc.configuration.url,
    method: doc.configuration.method,
    headers: doc.configuration.headers,
    authType: doc.configuration.authType,
    apiKeyHeader: doc.configuration.apiKeyHeader,
    secret: doc.encryptedCredentials ? decrypt(doc.encryptedCredentials) : undefined,
  };
}

/**
 * Run a workflow through the single execution engine and persist the result.
 * Manual, webhook, schedule and retry executions all come through here.
 */
async function runWorkflow({ workflow, triggerType, input = {}, retryOf, deps = {} }) {
  const userId = workflow.userId;
  const user = await User.findById(userId).select('preferences');
  const execution = await Execution.create({
    userId,
    workflowId: workflow._id,
    workflowName: workflow.name,
    status: 'running',
    triggerType,
    retryOf,
    input: sanitizeTriggerInput(input), // never persist raw Authorization/Cookie headers
    startedAt: new Date(),
  });

  let outcome;
  try {
    outcome = await runGraph({
      workflow,
      userId,
      executionId: execution._id,
      triggerInput: input,
      deps: {
        loadIntegration,
        defaults: user ? { timeoutMs: user.preferences.defaultHttpTimeoutMs, retries: user.preferences.defaultRetries } : {},
        ...deps,
      },
      onNodeResult: (result) => Execution.updateOne({ _id: execution._id }, { $push: { nodeResults: result } }),
      shouldCancel: async () => {
        const current = await Execution.findById(execution._id).select('status').lean();
        return !current || current.status === 'cancelled';
      },
    });
  } catch (err) {
    // An engine-level crash must never leave an execution stuck in "running".
    outcome = { status: 'failed', error: { message: `Engine error: ${err.message}` }, startedAt: execution.startedAt, completedAt: new Date(), logs: [] };
  }

  return Execution.findByIdAndUpdate(
    execution._id,
    {
      status: outcome.status,
      completedAt: outcome.completedAt,
      duration: outcome.completedAt - execution.startedAt,
      error: outcome.error || undefined,
      executionContext: outcome.context ? { trigger: outcome.context.trigger, variables: outcome.variables, execution: outcome.context.execution } : undefined,
      logs: outcome.logs,
    },
    { new: true }
  );
}

module.exports = { runWorkflow, loadIntegration };
