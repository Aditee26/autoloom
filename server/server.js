const mongoose = require('mongoose');
const env = require('./config/env');
const app = require('./app');
const scheduler = require('./services/scheduler');
const Execution = require('./models/Execution');
const { seedTemplates } = require('./utils/seedTemplates');

async function start() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri);
  console.log('[db] connected');

  await seedTemplates();

  // Executions left "running" by a crash/restart can never finish; mark them failed so history is truthful.
  const stale = await Execution.updateMany(
    { status: { $in: ['running', 'pending'] } },
    { status: 'failed', completedAt: new Date(), error: { message: 'Server restarted while this execution was running' } }
  );
  if (stale.modifiedCount) console.warn(`[startup] marked ${stale.modifiedCount} interrupted execution(s) as failed`);

  if (env.schedulerEnabled) await scheduler.init();

  const server = app.listen(env.port, () => console.log(`[server] listening on :${env.port} (${env.nodeEnv})`));

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    scheduler.stopAll();
    server.close(async () => { await mongoose.disconnect(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => { console.error('[fatal] failed to start', err); process.exit(1); });
