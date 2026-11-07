const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const env = require('./config/env');
const routes = require('./routes');
const webhook = require('./controllers/webhookController');
const { apiLimiter, webhookLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();
app.disable('x-powered-by');
if (env.nodeEnv === 'production') app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: env.clientUrl.split(',').map((s) => s.trim()), credentials: true }));

app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok', uptime: process.uptime() }));

// Public webhook endpoint: its own small body limit, sanitiser and rate limiter. Registered before the global parser.
app.post('/api/webhooks/:webhookId', webhookLimiter, express.json({ limit: '256kb' }), mongoSanitize(), webhook.receive);

app.use(express.json({ limit: '1mb' }));
app.use(mongoSanitize());
app.use('/api', apiLimiter, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
