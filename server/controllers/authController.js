const User = require('../models/User');
const Workflow = require('../models/Workflow');
const Execution = require('../models/Execution');
const Integration = require('../models/Integration');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const scheduler = require('../services/scheduler');
const { signToken } = require('../middleware/auth');

const send = (res, status, user) => res.status(status).json({ success: true, data: { token: signToken(user._id), user: user.toSafeJSON() } });

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.findOne({ email })) throw new ApiError(409, 'An account with that email already exists');
  const user = await User.create({ name, email, password });
  send(res, 201, user);
});

exports.login = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: String(req.body.email).toLowerCase() }).select('+password');
  // Same message for unknown email and wrong password to avoid account enumeration.
  if (!user || !(await user.comparePassword(req.body.password))) throw new ApiError(401, 'Invalid email or password');
  send(res, 200, user);
});

exports.me = (req, res) => res.json({ success: true, data: { user: req.user.toSafeJSON() } });

exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, workspaceName, theme, preferences } = req.body;
  if (name !== undefined) req.user.name = name;
  if (workspaceName !== undefined) req.user.workspaceName = workspaceName;
  if (theme !== undefined) req.user.theme = theme;
  if (preferences) {
    for (const k of ['defaultHttpTimeoutMs', 'defaultRetries', 'emailOnFailure']) {
      if (preferences[k] !== undefined) req.user.preferences[k] = preferences[k];
    }
  }
  await req.user.save();
  res.json({ success: true, data: { user: req.user.toSafeJSON() } });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body.currentPassword))) throw new ApiError(400, 'Current password is incorrect');
  user.password = req.body.newPassword;
  await user.save();
  res.json({ success: true, message: 'Password updated' });
});

exports.deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body.password))) throw new ApiError(400, 'Password is incorrect');
  const workflows = await Workflow.find({ userId: user._id }).select('_id');
  workflows.forEach((w) => scheduler.stop(w._id));
  await Promise.all([
    Execution.deleteMany({ userId: user._id }),
    Workflow.deleteMany({ userId: user._id }),
    Integration.deleteMany({ userId: user._id }),
  ]);
  await user.deleteOne();
  res.json({ success: true, message: 'Account and all associated data deleted' });
});
