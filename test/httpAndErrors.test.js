// test/httpAndErrors.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  AppError,
  ValidationError,
  PermissionError,
  HierarchyError,
  RateLimitError,
  ExternalAPIError,
  DatabaseError,
} = require('../utils/errors');
const { validateUrl } = require('../utils/http');

describe('Application Error Hierarchy & HTTP Security', () => {
  it('AppError hierarchy produces structured error properties', () => {
    const valErr = new ValidationError('Bad param', { field: 'username' });
    assert.equal(valErr instanceof AppError, true);
    assert.equal(valErr.status, 400);
    assert.equal(valErr.code, 'VALIDATION_ERROR');
    assert.equal(valErr.userMessage, 'Bad param');
    assert.deepEqual(valErr.details, { field: 'username' });

    const permErr = new PermissionError();
    assert.equal(permErr.status, 403);
    assert.equal(permErr.code, 'PERMISSION_ERROR');

    const hierErr = new HierarchyError('Role too high');
    assert.equal(hierErr.status, 403);
    assert.equal(hierErr.code, 'HIERARCHY_ERROR');

    const rateErr = new RateLimitError(5);
    assert.equal(rateErr.status, 429);
    assert.equal(rateErr.code, 'RATE_LIMIT_ERROR');
    assert.equal(rateErr.details.retryAfter, 5);

    const apiErr = new ExternalAPIError('CoinGecko', 'Timeout');
    assert.equal(apiErr.status, 502);
    assert.equal(apiErr.code, 'EXTERNAL_API_ERROR');
    assert.match(apiErr.userMessage, /CoinGecko/);

    const dbErr = new DatabaseError('Connection failed');
    assert.equal(dbErr.status, 500);
    assert.equal(dbErr.code, 'DATABASE_ERROR');
  });

  it('SSRF Validator blocks non-HTTP/HTTPS protocols and private IP ranges', () => {
    // Valid public URLs
    assert.doesNotThrow(() => validateUrl('https://api.coingecko.com/api/v3/simple/price'));
    assert.doesNotThrow(() => validateUrl('http://meme-api.com/gimme'));

    // Invalid protocols
    assert.throws(() => validateUrl('file:///etc/passwd'), /Forbidden URL protocol/);
    assert.throws(() => validateUrl('ftp://example.com/test'), /Forbidden URL protocol/);
    assert.throws(() => validateUrl('javascript:alert(1)'), /Forbidden URL protocol/);

    // Private / internal IP ranges
    assert.throws(() => validateUrl('http://localhost:3000'), /Forbidden host/);
    assert.throws(() => validateUrl('http://127.0.0.1/admin'), /Forbidden host/);
    assert.throws(() => validateUrl('http://169.254.169.254/latest/meta-data'), /Forbidden host/);
    assert.throws(() => validateUrl('http://192.168.1.1/router'), /Forbidden host/);
    assert.throws(() => validateUrl('http://10.0.0.1/internal'), /Forbidden host/);
    assert.throws(() => validateUrl('http://172.16.0.1/secret'), /Forbidden host/);
  });
});
