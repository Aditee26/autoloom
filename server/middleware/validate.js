const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

module.exports = (req, _res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
  return next(new ApiError(400, details[0].message, details));
};
