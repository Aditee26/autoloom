const { body, param, query } = require('express-validator');

const mongoId = (name = 'id') => param(name).isMongoId().withMessage('Invalid id');
const plainString = (field, opts = {}) =>
  body(field).isString().withMessage(`${field} must be a string`).bail().trim().isLength({ min: opts.min ?? 1, max: opts.max ?? 200 }).withMessage(`${field} must be ${opts.min ?? 1}-${opts.max ?? 200} characters`);

module.exports = {
  mongoId,
  register: [
    plainString('name', { max: 80 }),
    body('email').isString().bail().trim().isEmail().withMessage('A valid email is required').normalizeEmail({ gmail_remove_dots: false }),
    body('password').isString().isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters'),
  ],
  login: [
    body('email').isString().bail().trim().isEmail().withMessage('A valid email is required'),
    body('password').isString().notEmpty().withMessage('Password is required'),
  ],
  profile: [
    body('name').optional().isString().trim().isLength({ min: 1, max: 80 }),
    body('workspaceName').optional().isString().trim().isLength({ min: 1, max: 80 }),
    body('theme').optional().isIn(['light', 'dark', 'system']).withMessage('Invalid theme'),
    body('preferences.defaultHttpTimeoutMs').optional().isInt({ min: 100, max: 30000 }),
    body('preferences.defaultRetries').optional().isInt({ min: 0, max: 3 }),
    body('preferences.emailOnFailure').optional().isBoolean(),
  ],
  password: [
    body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
    body('newPassword').isString().isLength({ min: 8, max: 128 }).withMessage('New password must be 8-128 characters'),
  ],
  deleteAccount: [body('password').isString().notEmpty().withMessage('Password is required to delete the account')],
  workflowCreate: [
    plainString('name', { max: 120 }),
    body('description').optional().isString().isLength({ max: 500 }),
    body('nodes').optional().isArray({ max: 100 }).withMessage('nodes must be an array'),
    body('edges').optional().isArray({ max: 300 }).withMessage('edges must be an array'),
  ],
  workflowUpdate: [
    mongoId(),
    body('name').optional().isString().trim().isLength({ min: 1, max: 120 }),
    body('description').optional().isString().isLength({ max: 500 }),
    body('nodes').optional().isArray({ max: 100 }).withMessage('nodes must be an array'),
    body('edges').optional().isArray({ max: 300 }).withMessage('edges must be an array'),
  ],
  workflowStatus: [mongoId(), body('status').isIn(['active', 'inactive']).withMessage('status must be active or inactive')],
  workflowList: [
    query('status').optional().isIn(['active', 'inactive']),
    query('search').optional().isString().isLength({ max: 100 }),
    query('sort').optional().isIn(['updated', 'name', 'created']),
  ],
  execute: [mongoId(), body('input').optional()],
  executionList: [
    query('status').optional().isIn(['pending', 'running', 'success', 'failed', 'cancelled']),
    query('workflowId').optional().isMongoId(),
    query('triggerType').optional().isIn(['manual', 'webhook', 'schedule', 'retry']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString().isLength({ max: 100 }),
  ],
  integration: [
    plainString('name', { max: 80 }),
    body('type').optional().isIn(['http', 'webhook']),
    body('configuration').isObject().withMessage('configuration is required'),
    body('configuration.url').isString().trim().isLength({ min: 1, max: 2000 }).withMessage('URL is required'),
    body('configuration.method').optional().isIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    body('configuration.authType').optional().isIn(['none', 'bearer', 'apiKey']),
    body('configuration.apiKeyHeader').optional().isString().matches(/^[A-Za-z0-9-]{1,100}$/).withMessage('Invalid header name'),
    body('configuration.headers').optional().isArray({ max: 20 }),
    body('secret').optional({ nullable: true }).isString().isLength({ max: 4000 }),
  ],
};
