const express = require('express');
const v = require('../validators');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const auth = require('../controllers/authController');
const wf = require('../controllers/workflowController');
const ex = require('../controllers/executionController');
const tpl = require('../controllers/templateController');
const integ = require('../controllers/integrationController');
const dash = require('../controllers/dashboardController');

const router = express.Router();

// Auth
router.post('/auth/register', authLimiter, v.register, validate, auth.register);
router.post('/auth/login', authLimiter, v.login, validate, auth.login);
router.get('/auth/me', protect, auth.me);
router.put('/auth/profile', protect, v.profile, validate, auth.updateProfile);
router.put('/auth/password', protect, authLimiter, v.password, validate, auth.changePassword);
router.delete('/auth/account', protect, authLimiter, v.deleteAccount, validate, auth.deleteAccount);

// Everything below requires a signed-in user and is scoped to that user.
router.use(protect);

router.get('/workflows', v.workflowList, validate, wf.list);
router.post('/workflows', v.workflowCreate, validate, wf.create);
router.get('/workflows/:id', v.mongoId(), validate, wf.get);
router.put('/workflows/:id', v.workflowUpdate, validate, wf.update);
router.delete('/workflows/:id', v.mongoId(), validate, wf.remove);
router.post('/workflows/:id/duplicate', v.mongoId(), validate, wf.duplicate);
router.patch('/workflows/:id/status', v.workflowStatus, validate, wf.setStatus);
router.post('/workflows/:id/execute', v.execute, validate, wf.execute);

router.get('/executions', v.executionList, validate, ex.list);
router.get('/executions/:id', v.mongoId(), validate, ex.get);
router.post('/executions/:id/retry', v.mongoId(), validate, ex.retry);
router.post('/executions/:id/cancel', v.mongoId(), validate, ex.cancel);

router.get('/templates', tpl.list);
router.get('/templates/:id', v.mongoId(), validate, tpl.get);
router.post('/templates/:id/clone', v.mongoId(), validate, tpl.clone);

router.get('/integrations', integ.list);
router.post('/integrations', v.integration, validate, integ.create);
router.put('/integrations/:id', v.mongoId(), v.integration, validate, integ.update);
router.delete('/integrations/:id', v.mongoId(), validate, integ.remove);

router.get('/dashboard/stats', dash.stats);
router.get('/dashboard/analytics', dash.analytics);

module.exports = router;
