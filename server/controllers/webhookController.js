const Workflow = require('../models/Workflow');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { WEBHOOK_ID_REGEX } = require('../utils/crypto');
const { runWorkflow } = require('../services/executionService');
const { validateWorkflow } = require('../services/workflowEngine/validator');

exports.receive = asyncHandler(async (req, res) => {
  const { webhookId } = req.params;
  if (!WEBHOOK_ID_REGEX.test(webhookId)) throw new ApiError(404, 'Webhook not found');
  const workflow = await Workflow.findOne({ webhookId });
  if (!workflow || workflow.triggerType !== 'webhook') throw new ApiError(404, 'Webhook not found');
  if (workflow.status !== 'active') throw new ApiError(409, 'Workflow is inactive');
  const validation = validateWorkflow(workflow);
  if (!validation.valid) throw new ApiError(422, 'Workflow is not valid', validation.errors);

  const execution = await runWorkflow({
    workflow,
    triggerType: 'webhook',
    input: { method: req.method, headers: req.headers, query: req.query, body: req.body },
  });
  const ok = execution.status === 'success';
  res.status(ok ? 200 : 422).json({
    success: ok,
    executionId: execution._id,
    status: execution.status,
    duration: execution.duration,
    ...(ok ? {} : { message: execution.error?.message }),
  });
});
