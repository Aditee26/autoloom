const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');
const env = require('../config/env');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) + parseInt(o, 10), 0) >>> 0;
}

const V4_BLOCKS = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([base, bits]) => ({ base: ipv4ToInt(base), mask: (~0 << (32 - bits)) >>> 0 }));

function isPrivateIPv4(ip) {
  const n = ipv4ToInt(ip);
  return V4_BLOCKS.some(({ base, mask }) => ((n & mask) >>> 0) === ((base & mask) >>> 0));
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(lower.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  return false;
}

function isPrivateIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // not a valid IP: treat as unsafe
}

class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/** Static checks that do not need DNS. Throws UnsafeUrlError. Returns the parsed URL. */
function validateUrlSyntax(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new UnsafeUrlError(`Unsupported protocol: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError('URLs containing credentials are not allowed');
  }
  if (env.allowPrivateHttp) return parsed;
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new UnsafeUrlError(`Destination host is not allowed: ${host}`);
  }
  if (net.isIP(host) && isPrivateIp(host)) {
    throw new UnsafeUrlError(`Destination IP is in a blocked range: ${host}`);
  }
  return parsed;
}

/** Resolve DNS and verify every returned address is public. */
async function assertPublicDestination(rawUrl) {
  const parsed = validateUrlSyntax(rawUrl);
  if (env.allowPrivateHttp) return parsed;
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return parsed;
  let addresses;
  try {
    addresses = await dns.promises.lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve host: ${host}`);
  }
  const bad = addresses.find((a) => isPrivateIp(a.address));
  if (bad) throw new UnsafeUrlError(`Host resolves to a blocked address: ${bad.address}`);
  return parsed;
}

/**
 * DNS lookup used by the HTTP agents. It runs at connection time on the address
 * that will actually be dialled, which closes the DNS-rebinding gap between
 * validation and request.
 */
function safeLookup(hostname, options, callback) {
  const opts = typeof options === 'function' ? {} : options || {};
  const cb = typeof options === 'function' ? options : callback;
  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err);
    if (!env.allowPrivateHttp) {
      const bad = addresses.find((a) => isPrivateIp(a.address));
      if (bad) return cb(new UnsafeUrlError(`Host resolves to a blocked address: ${bad.address}`));
    }
    if (opts.all) return cb(null, addresses);
    return cb(null, addresses[0].address, addresses[0].family);
  });
}

const httpAgent = new http.Agent({ lookup: safeLookup, keepAlive: false });
const httpsAgent = new https.Agent({ lookup: safeLookup, keepAlive: false });

module.exports = {
  isPrivateIp,
  validateUrlSyntax,
  assertPublicDestination,
  safeLookup,
  httpAgent,
  httpsAgent,
  UnsafeUrlError,
};
