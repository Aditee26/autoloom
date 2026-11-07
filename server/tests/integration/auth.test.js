const { app, request, connect, disconnect, clear, registerUser, authed } = require('./setup');
const User = require('../../models/User');

beforeAll(connect);
afterAll(disconnect);
beforeEach(clear);

describe('authentication', () => {
  test('register returns token + safe user and stores a bcrypt hash', async () => {
    const u = await registerUser({ email: 'ada@example.com' });
    expect(u.res.status).toBe(201);
    expect(u.res.body.data.token).toEqual(expect.any(String));
    expect(u.res.body.data.user.password).toBeUndefined();
    const stored = await User.findOne({ email: 'ada@example.com' }).select('+password');
    expect(stored.password).not.toBe(u.password);
    expect(stored.password).toMatch(/^\$2[aby]\$/);
  });
  test('duplicate email is rejected, invalid input is 400', async () => {
    await registerUser({ email: 'dup@example.com' });
    const dup = await request(app).post('/api/auth/register').send({ name: 'x', email: 'dup@example.com', password: 'Passw0rd!123' });
    expect(dup.status).toBe(409);
    expect((await request(app).post('/api/auth/register').send({ name: 'x', email: 'nope', password: 'Passw0rd!123' })).status).toBe(400);
    expect((await request(app).post('/api/auth/register').send({ name: 'x', email: 'a@b.com', password: 'short' })).status).toBe(400);
  });
  test('login succeeds, wrong password and unknown email give the same 401', async () => {
    const u = await registerUser({ email: 'login@example.com' });
    const ok = await request(app).post('/api/auth/login').send({ email: 'login@example.com', password: u.password });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/api/auth/login').send({ email: 'login@example.com', password: 'wrongwrong' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'wrongwrong' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.message).toBe(unknown.body.message);
  });
  test('NoSQL injection in login is rejected', async () => {
    await registerUser({ email: 'inj@example.com' });
    const res = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect([400, 401]).toContain(res.status);
    expect(res.body.data).toBeUndefined();
  });
  test('protected routes require a valid token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/workflows')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage')).status).toBe(401);
    const u = await registerUser();
    const me = await request(app).get('/api/auth/me').set(authed(u.token));
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(u.email.toLowerCase());
  });
  test('profile update, password change, account deletion', async () => {
    const u = await registerUser();
    const prof = await request(app).put('/api/auth/profile').set(authed(u.token)).send({ name: 'New Name', workspaceName: 'Acme', theme: 'dark', preferences: { defaultRetries: 2 } });
    expect(prof.status).toBe(200);
    expect(prof.body.data.user).toMatchObject({ name: 'New Name', workspaceName: 'Acme', theme: 'dark' });
    expect(prof.body.data.user.preferences.defaultRetries).toBe(2);
    expect((await request(app).put('/api/auth/profile').set(authed(u.token)).send({ theme: 'neon' })).status).toBe(400);

    const wrong = await request(app).put('/api/auth/password').set(authed(u.token)).send({ currentPassword: 'nope', newPassword: 'AnotherPass1!' });
    expect(wrong.status).toBe(400);
    const changed = await request(app).put('/api/auth/password').set(authed(u.token)).send({ currentPassword: u.password, newPassword: 'AnotherPass1!' });
    expect(changed.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: u.password })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: 'AnotherPass1!' })).status).toBe(200);

    await request(app).post('/api/workflows').set(authed(u.token)).send({ name: 'to be deleted' });
    expect((await request(app).delete('/api/auth/account').set(authed(u.token)).send({ password: 'bad' })).status).toBe(400);
    expect((await request(app).delete('/api/auth/account').set(authed(u.token)).send({ password: 'AnotherPass1!' })).status).toBe(200);
    expect(await User.countDocuments({ _id: u.id })).toBe(0);
    expect((await request(app).get('/api/auth/me').set(authed(u.token))).status).toBe(401);
  });
});
