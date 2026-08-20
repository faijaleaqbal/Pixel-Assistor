const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { validateUrl } = require('../utils/http');
const { evaluate } = require('../utils/mathEval');
const commandHandler = require('../handlers/commandHandler');

describe('Red-Team SSRF & URL Attack Suite', () => {
  it('Blocks IPv4 Decimal encoded loopback / private addresses', () => {
    // 2130706433 is 127.0.0.1 in decimal integer format
    assert.throws(() => validateUrl('http://2130706433'), /Forbidden host/);
    // 0x7f000001 is 127.0.0.1 in hex
    assert.throws(() => validateUrl('http://0x7f000001'), /Forbidden host/);
  });

  it('Blocks CGNAT (100.64.0.0/10) shared address space', () => {
    assert.throws(() => validateUrl('http://100.64.0.1'), /Forbidden host/);
    assert.throws(() => validateUrl('http://100.127.255.254'), /Forbidden host/);
  });

  it('Blocks IPv6 Link-Local, Unique-Local, and Loopback literals', () => {
    assert.throws(() => validateUrl('http://[::1]'), /Forbidden host/);
    assert.throws(() => validateUrl('http://[fe80::1]'), /Forbidden host/);
    assert.throws(() => validateUrl('http://[fc00::1]'), /Forbidden host/);
    assert.throws(() => validateUrl('http://[fd12:3456:789a:1::1]'), /Forbidden host/);
  });

  it('Blocks IPv4-Mapped IPv6 addresses', () => {
    assert.throws(() => validateUrl('http://[::ffff:127.0.0.1]'), /Forbidden host/);
    assert.throws(() => validateUrl('http://[::ffff:10.0.0.1]'), /Forbidden host/);
    assert.throws(() => validateUrl('http://[::ffff:192.168.1.1]'), /Forbidden host/);
  });

  it('Blocks AWS/GCP/Azure link-local cloud metadata service (169.254.169.254)', () => {
    assert.throws(() => validateUrl('http://169.254.169.254/latest/meta-data'), /Forbidden host/);
    assert.throws(() => validateUrl('http://169.254.1.1'), /Forbidden host/);
  });

  it('Blocks reserved internal and test domains (.local, .internal, .localhost, .arpa)', () => {
    assert.throws(() => validateUrl('http://myservice.local/admin'), /Forbidden host/);
    assert.throws(() => validateUrl('http://db.internal'), /Forbidden host/);
    assert.throws(() => validateUrl('http://test.localhost'), /Forbidden host/);
  });

  it('Blocks dangerous protocols (file, gopher, ftp, dict, sftp)', () => {
    assert.throws(() => validateUrl('file:///etc/shadow'), /Forbidden URL protocol/);
    assert.throws(() => validateUrl('gopher://127.0.0.1:70'), /Forbidden URL protocol/);
    assert.throws(() => validateUrl('ftp://example.com/test'), /Forbidden URL protocol/);
  });

  it('Allows internal URLs only when allowInternal: true is explicitly provided', () => {
    assert.doesNotThrow(() => validateUrl('http://127.0.0.1:3847/upload', { allowInternal: true }));
    assert.doesNotThrow(() => validateUrl('http://localhost:3847/upload', { allowInternal: true }));
  });
});

describe('Red-Team Math Engine Stress & Complexity Attacks', () => {
  it('Rejects inputs exceeding maximum expression length (500 chars)', () => {
    const hugeExpr = '1 + '.repeat(200) + '1';
    assert.throws(() => evaluate(hugeExpr), /Expression too long/);
  });

  it('Rejects expressions exceeding maximum token complexity (100 tokens)', () => {
    const complexExpr = '1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1';
    assert.throws(() => evaluate(complexExpr), /Expression too complex/);
  });

  it('Rejects parentheses nesting deeper than 30 levels', () => {
    const deepParen = '('.repeat(35) + '1' + ')'.repeat(35);
    assert.throws(() => evaluate(deepParen), /Parentheses nesting too deep/);
  });

  it('Rejects exponent operations with excessively large powers', () => {
    assert.throws(() => evaluate('2 ^ 20000'), /Exponent too large/);
    assert.throws(() => evaluate('0 ^ -1'), /Division by zero/);
  });

  it('Correctly parses and evaluates scientific notation', () => {
    assert.equal(evaluate('1.5e3 + 500'), 2000);
    assert.equal(evaluate('2e-2 * 100'), 2);
    assert.equal(evaluate('1e6 / 1e3'), 1000);
  });
});

describe('Red-Team Command Resolution & Normalization', () => {
  const mockClient = { commands: new Map() };
  commandHandler.load(mockClient);

  it('Resolves commands with uppercase, mixed-case, and whitespace correctly', () => {
    assert.ok(commandHandler.resolve('PING'));
    assert.ok(commandHandler.resolve('  ping  '));
    assert.ok(commandHandler.resolve('HeLp'));
    assert.ok(commandHandler.resolve('   bAl   '));
    assert.equal(commandHandler.resolve('non_existent_cmd_xyz'), null);
    assert.equal(commandHandler.resolve(''), null);
    assert.equal(commandHandler.resolve(null), null);
    assert.equal(commandHandler.resolve(undefined), null);
  });

  it('Resolves all registered aliases regardless of case or whitespace', () => {
    assert.ok(commandHandler.resolve('vw')); // alias for view
    assert.ok(commandHandler.resolve('  VW  '));
    assert.ok(commandHandler.resolve('h')); // alias for help
  });
});

const http = require('http');
const { request } = require('../utils/http');

describe('Red-Team Redirect & SSRF Chain Tests', () => {
  let server;
  let port;

  before(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/redirect-to-private') {
        res.writeHead(302, { Location: 'http://10.0.0.1/admin' });
        res.end();
      } else if (req.url === '/redirect-to-metadata') {
        res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' });
        res.end();
      } else if (req.url === '/redirect-loop') {
        res.writeHead(302, { Location: `http://127.0.0.1:${port}/redirect-loop` });
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      }
    });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('Blocks redirect chain attempting to pivot to private IP (10.0.0.1)', async () => {
    await assert.rejects(
      () => request(`http://127.0.0.1:${port}/redirect-to-private`, { allowInternal: true }),
      /Forbidden host/
    );
  });

  it('Blocks redirect chain attempting to pivot to cloud metadata (169.254.169.254)', async () => {
    await assert.rejects(
      () => request(`http://127.0.0.1:${port}/redirect-to-metadata`, { allowInternal: true }),
      /Forbidden host/
    );
  });

  it('Halts infinite redirect loops before exceeding threshold', async () => {
    await assert.rejects(
      () => request(`http://127.0.0.1:${port}/redirect-loop`, { allowInternal: true, maxRedirects: 3 }),
      /Maximum redirect limit \(3\) exceeded/
    );
  });
});

describe('Red-Team Concurrency & High-Throughput Stress', () => {
  it('Handles 100 concurrent math evaluations safely without race or memory leak', async () => {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(Promise.resolve().then(() => evaluate(`${i} * 2 + (10 - 5)`)));
    }
    const results = await Promise.all(promises);
    assert.equal(results.length, 100);
    assert.equal(results[0], 5);
    assert.equal(results[99], 203);
  });
});

