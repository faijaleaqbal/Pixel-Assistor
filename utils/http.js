// src/utils/http.js
// Resilient HTTP client with timeouts, retry with exponential backoff, and SSRF guard.

const { ExternalAPIError } = require('./errors');
const logger = require('./logger');

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;

const net = require('net');

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true;
    const [a, b, c] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (Link-Local & Cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
    if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 (6to4 Relay)
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 198 && b >= 18 && b <= 19) return true; // 198.18.0.0/15 (Benchmarking)
    if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
    if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
    if (a >= 224) return true; // 224.0.0.0/4 (Multicast / Reserved)
    return false;
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (/^fe[89ab]/i.test(normalized)) return true; // fe80::/10 (Link-Local)
    if (/^f[cd]/i.test(normalized)) return true; // fc00::/7 (Unique Local)
    if (normalized.startsWith('::ffff:')) {
      const v4part = normalized.slice(7);
      if (net.isIPv4(v4part)) return isPrivateIp(v4part);
      if (v4part.includes(':')) {
        const [h1, h2] = v4part.split(':');
        const num1 = parseInt(h1, 16);
        const num2 = parseInt(h2, 16);
        if (!isNaN(num1) && !isNaN(num2)) {
          const mappedV4 = `${(num1 >> 8) & 255}.${num1 & 255}.${(num2 >> 8) & 255}.${num2 & 255}`;
          return isPrivateIp(mappedV4);
        }
      }
    }
    return false;
  }

  return false;
}

// Guard against SSRF to private/internal IPs and non-http(s) protocols
function validateUrl(rawUrl, options = {}) {
  const { allowInternal = false } = options;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Forbidden URL protocol: ${parsed.protocol}`);
  }

  if (allowInternal) return parsed;

  let hostname = parsed.hostname.toLowerCase();
  // Strip bracket notation from IPv6 literals
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  // Block localhost and standard internal domain names
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.arpa') ||
    hostname.endsWith('.invalid')
  ) {
    throw new Error('Forbidden host: access to private network addresses is not allowed.');
  }

  // Handle decimal/hex integer IP representations (e.g. 2130706433 or 0x7f000001)
  if (/^(?:0x[0-9a-f]+|\d+)$/i.test(hostname)) {
    const num = Number(hostname);
    if (!isNaN(num) && num >= 0 && num <= 0xffffffff) {
      const ip = [
        (num >>> 24) & 255,
        (num >>> 16) & 255,
        (num >>> 8) & 255,
        num & 255,
      ].join('.');
      if (isPrivateIp(ip)) {
        throw new Error('Forbidden host: access to private network addresses is not allowed.');
      }
    }
  }

  if (isPrivateIp(hostname)) {
    throw new Error('Forbidden host: access to private network addresses is not allowed.');
  }

  return parsed;
}

async function request(url, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT_MS,
    retries = 0,
    backoffMs = 500,
    label = 'External API',
    validateStatus = true,
    allowInternal = false,
    maxRedirects = 5,
    ...fetchOpts
  } = options;

  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    let currentUrl = url;
    let redirectCount = 0;

    try {
      while (true) {
        validateUrl(currentUrl, { allowInternal });

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        let res;
        try {
          res = await fetch(currentUrl, {
            ...fetchOpts,
            redirect: 'manual',
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        // Handle redirects securely
        if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
          redirectCount++;
          if (redirectCount > maxRedirects) {
            throw new ExternalAPIError(label, `Maximum redirect limit (${maxRedirects}) exceeded`);
          }
          const location = res.headers.get('location');
          const nextParsed = new URL(location, currentUrl);
          const currParsed = new URL(currentUrl);
          // allowInternal only persists if redirect stays on the exact same origin
          const sameOriginInternal = allowInternal && (nextParsed.origin === currParsed.origin);
          validateUrl(nextParsed.href, { allowInternal: sameOriginInternal });
          currentUrl = nextParsed.href;
          continue;
        }

        if (validateStatus && !res.ok) {
          // Non-2xx response
          if (res.status === 429) {
            throw new ExternalAPIError(label, 'Rate limited (429)', { status: 429 });
          }
          // Do not retry 4xx errors except 429
          if (res.status >= 400 && res.status < 500) {
            throw new ExternalAPIError(label, `Client error status ${res.status}`, { status: res.status });
          }
          throw new ExternalAPIError(label, `Server error status ${res.status}`, { status: res.status });
        }

        return res;
      }
    } catch (err) {
      lastError = err;

      // Check if abort / timeout
      if (err.name === 'AbortError') {
        lastError = new ExternalAPIError(label, `Request timed out after ${timeout}ms`);
      }

      // If client error or non-retryable or security rejection, don't retry
      if (
        (err instanceof ExternalAPIError && err.details?.status >= 400 && err.details?.status < 500 && err.details?.status !== 429) ||
        (err.message && err.message.includes('Forbidden host'))
      ) {
        throw lastError;
      }

      attempt++;
      if (attempt <= retries) {
        const delay = backoffMs * Math.pow(2, attempt - 1);
        logger.debug(`[http] Retrying ${url} (attempt ${attempt}/${retries}) in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

async function getJson(url, options = {}) {
  const res = await request(url, { ...options, method: 'GET' });
  const label = options.label || 'API';
  try {
    return await res.json();
  } catch (err) {
    throw new ExternalAPIError(label, `Failed to parse JSON response: ${err.message}`);
  }
}

async function getBuffer(url, options = {}) {
  const res = await request(url, { ...options, method: 'GET' });
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

module.exports = {
  request,
  getJson,
  getBuffer,
  validateUrl,
  DEFAULT_TIMEOUT_MS,
  MAX_RETRIES,
};
