const axios = require('axios');
const { assertPublicDestination, httpAgent, httpsAgent, UnsafeUrlError } = require('../../utils/ssrf');
const { HTTP_METHODS, LIMITS } = require('../workflowEngine/nodeTypes');

const SENSITIVE_HEADERS = ['authorization', 'x-api-key', 'cookie', 'proxy-authorization'];
const RETRYABLE = (status) => status === 429 || status >= 500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toObject(list) {
  if (!list) return {};
  if (Array.isArray(list)) {
    return list.reduce((acc, item) => {
      if (item && item.key && String(item.key).trim()) acc[String(item.key).trim()] = item.value === undefined ? '' : String(item.value);
      return acc;
    }, {});
  }
  if (typeof list === 'object') return Object.fromEntries(Object.entries(list).map(([k, v]) => [k, String(v)]));
  return {};
}

function maskHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) out[k] = SENSITIVE_HEADERS.includes(k.toLowerCase()) ? '********' : v;
  return out;
}

function truncate(body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  if (text && text.length > LIMITS.maxStoredBodyChars) {
    return `${text.slice(0, LIMITS.maxStoredBodyChars)}… [truncated ${text.length - LIMITS.maxStoredBodyChars} chars]`;
  }
  return body;
}

/** Input recorded in execution history (secrets masked). */
function describeInput(config) {
  return {
    method: String(config.method || 'GET').toUpperCase(),
    url: config.url,
    headers: maskHeaders(toObject(config.headers)),
    query: toObject(config.queryParams),
    body: config.body,
    integrationId: config.integrationId || undefined,
  };
}

async function httpRequestHandler({ config, context, deps }) {
  let url = config.url;
  let method = String(config.method || 'GET').toUpperCase();
  const headers = toObject(config.headers);
  const params = toObject(config.queryParams);

  if (config.integrationId) {
    const integration = deps.loadIntegration ? await deps.loadIntegration(context.userId, config.integrationId) : null;
    if (!integration) throw new Error('Selected integration was not found');
    url = url || integration.url;
    if (!config.method && integration.method) method = integration.method;
    Object.assign(headers, toObject(integration.headers), headers);
    if (integration.authType === 'bearer' && integration.secret) headers.Authorization = `Bearer ${integration.secret}`;
    if (integration.authType === 'apiKey' && integration.secret) headers[integration.apiKeyHeader || 'X-API-Key'] = integration.secret;
  }

  if (!url) throw new Error('URL is required');
  if (!HTTP_METHODS.includes(method)) throw new Error(`Unsupported HTTP method: ${method}`);

  const target = await assertPublicDestination(String(url));

  let data;
  if (config.body !== undefined && config.body !== null && config.body !== '' && !['GET', 'DELETE'].includes(method)) {
    data = typeof config.body === 'string' ? JSON.parse(config.body) : config.body;
    if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
  }

  const defaults = deps.defaults || {};
  const timeout = Math.min(Number(config.timeoutMs) || defaults.timeoutMs || LIMITS.defaultHttpTimeoutMs, LIMITS.maxHttpTimeoutMs);
  const retries = Math.min(Math.max(Number(config.retries ?? defaults.retries) || 0, 0), LIMITS.maxRetries);
  const failOnHttpError = config.failOnHttpError !== false;
  const request = deps.httpClient || axios.request;

  let attempt = 0;
  let lastError;
  const started = Date.now();
  while (attempt <= retries) {
    attempt += 1;
    try {
      const response = await request({
        url: target.toString(),
        method,
        headers,
        params,
        data,
        timeout,
        maxRedirects: 0,
        maxContentLength: LIMITS.maxResponseBytes,
        maxBodyLength: LIMITS.maxResponseBytes,
        httpAgent,
        httpsAgent,
        validateStatus: () => true,
      });
      const retryable = RETRYABLE(response.status);
      if (retryable && attempt <= retries) {
        await sleep(deps.retryDelayMs !== undefined ? deps.retryDelayMs : 500 * attempt);
        continue;
      }
      const output = {
        status: response.status,
        statusText: response.statusText,
        headers: maskHeaders(response.headers || {}),
        body: truncate(response.data),
        durationMs: Date.now() - started,
        attempts: attempt,
      };
      if (failOnHttpError && (response.status < 200 || response.status >= 300)) {
        const error = new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim());
        error.output = output;
        throw error;
      }
      return { output };
    } catch (err) {
      if (err.output) throw err; // non-2xx surfaced above, no retry left
      lastError = err;
      if (err instanceof UnsafeUrlError || (err.cause && err.cause instanceof UnsafeUrlError)) throw err;
      if (attempt > retries) break;
      await sleep(deps.retryDelayMs !== undefined ? deps.retryDelayMs : 500 * attempt);
    }
  }
  const e = new Error(
    lastError && lastError.code === 'ECONNABORTED'
      ? `Request timed out after ${timeout} ms`
      : `Request failed: ${lastError ? lastError.message : 'unknown error'}`
  );
  e.output = { attempts: attempt, durationMs: Date.now() - started };
  throw e;
}

module.exports = { httpRequestHandler, describeInput, toObject, maskHeaders };
