const mongoose = require('mongoose');
const request = require('supertest');

const env = require('../../config/env');
const app = require('../../app');

async function connect() {
  if (!/test/i.test(env.mongoUri)) throw new Error(`Refusing to run tests against a non-test database: ${env.mongoUri}`);
  await mongoose.connect(env.mongoUri);
  await mongoose.connection.dropDatabase();
}
async function disconnect() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
async function clear() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

let counter = 0;
async function registerUser(overrides = {}) {
  counter += 1;
  const creds = { name: `User ${counter}`, email: `user${counter}_${Date.now()}@example.com`, password: 'Passw0rd!123', ...overrides };
  const res = await request(app).post('/api/auth/register').send(creds);
  return { ...creds, token: res.body.data.token, id: res.body.data.user.id, res };
}
const authed = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { app, request, connect, disconnect, clear, registerUser, authed };
