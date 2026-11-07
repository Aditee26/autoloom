const { httpRequestHandler } = require('./httpRequest');
const simple = require('./simple');

module.exports = {
  manualTrigger: simple.triggerHandler,
  webhookTrigger: simple.triggerHandler,
  scheduleTrigger: simple.triggerHandler,
  condition: simple.conditionHandler,
  httpRequest: httpRequestHandler,
  delay: simple.delayHandler,
  setVariable: simple.setVariableHandler,
  logMessage: simple.logMessageHandler,
};
