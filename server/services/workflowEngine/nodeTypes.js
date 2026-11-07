const TRIGGER_TYPES = ['manualTrigger', 'webhookTrigger', 'scheduleTrigger'];
const NODE_TYPES = [...TRIGGER_TYPES, 'condition', 'httpRequest', 'delay', 'setVariable', 'logMessage'];
const TRIGGER_KIND = { manualTrigger: 'manual', webhookTrigger: 'webhook', scheduleTrigger: 'schedule' };
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const LIMITS = {
  maxNodesPerWorkflow: 50,
  maxNodeExecutions: 50,
  maxDelaySeconds: 30,
  maxHttpTimeoutMs: 30000,
  defaultHttpTimeoutMs: 10000,
  maxRetries: 3,
  maxResponseBytes: 1024 * 1024,
  maxStoredBodyChars: 20000,
  maxWorkflowRuntimeMs: 120000,
};
module.exports = { TRIGGER_TYPES, NODE_TYPES, TRIGGER_KIND, HTTP_METHODS, LIMITS };
