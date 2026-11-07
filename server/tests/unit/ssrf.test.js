const { isPrivateIp, validateUrlSyntax, assertPublicDestination, UnsafeUrlError } = require('../../utils/ssrf');

describe('SSRF guard', () => {
  test.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:7f00:1',
  ])('blocks private address %s', (ip) => expect(isPrivateIp(ip)).toBe(true));

  test.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111'])(
    'allows public address %s', (ip) => expect(isPrivateIp(ip)).toBe(false)
  );

  test.each([
    'http://localhost/x', 'http://127.0.0.1:8080', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data',
    'http://metadata.google.internal/computeMetadata/v1', 'http://10.0.0.5', 'http://app.localhost',
    'file:///etc/passwd', 'ftp://example.com', 'gopher://x', 'javascript:alert(1)', 'not a url',
    'http://user:pass@example.com', 'http://service.internal/',
  ])('rejects %s', (url) => expect(() => validateUrlSyntax(url)).toThrow(UnsafeUrlError));

  test('accepts ordinary public URLs syntactically', () => {
    expect(validateUrlSyntax('https://api.example.com/v1?x=1').hostname).toBe('api.example.com');
  });

  test('IP-literal public destination passes without DNS', async () => {
    await expect(assertPublicDestination('http://8.8.8.8/')).resolves.toBeDefined();
  });
  test('private IP literal fails async check', async () => {
    await expect(assertPublicDestination('http://192.168.0.10/')).rejects.toThrow(UnsafeUrlError);
  });
});
