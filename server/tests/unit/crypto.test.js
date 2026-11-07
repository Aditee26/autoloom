const { encrypt, decrypt, generateWebhookId, WEBHOOK_ID_REGEX } = require('../../utils/crypto');

describe('crypto utils', () => {
  test('round-trips and uses a fresh IV each time', () => {
    const a = encrypt('super-secret');
    const b = encrypt('super-secret');
    expect(a).not.toBe(b);
    expect(a).not.toContain('super-secret');
    expect(decrypt(a)).toBe('super-secret');
  });
  test('tampering is detected', () => {
    const [iv, tag, data] = encrypt('x').split('.');
    const bad = [iv, tag, Buffer.from('zzzz').toString('base64')].join('.');
    expect(() => decrypt(bad)).toThrow();
    expect(() => decrypt('garbage')).toThrow();
  });
  test('webhook ids are 48 hex chars and unique', () => {
    const ids = new Set(Array.from({ length: 50 }, generateWebhookId));
    expect(ids.size).toBe(50);
    ids.forEach((id) => expect(id).toMatch(WEBHOOK_ID_REGEX));
  });
});
