const env = require('../config/env');

function notFound(req, _res, next) {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  err.isOperational = true;
  next(err);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = err.statusCode || err.status || 500;
  let message = err.message;
  let details = err.details;

  if (err.name === 'ValidationError') { status = 400; message = 'Validation failed'; details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })); }
  else if (err.name === 'CastError') { status = 400; message = `Invalid ${err.path}`; }
  else if (err.code === 11000) { status = 409; message = 'A record with that value already exists'; }
  else if (err.type === 'entity.parse.failed') { status = 400; message = 'Malformed JSON body'; }
  else if (err.type === 'entity.too.large') { status = 413; message = 'Payload too large'; }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    if (!err.isOperational) message = 'Internal server error'; // never leak internals
  }
  const body = { success: false, message };
  if (details) body.details = details;
  if (env.nodeEnv === 'development' && status >= 500) body.stack = err.stack;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
