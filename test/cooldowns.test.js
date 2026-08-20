// test/cooldowns.test.js
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const cooldowns = require('../utils/cooldowns');

describe('Cooldowns & Rate Limiting Engine', () => {
  beforeEach(() => {
    cooldowns.clear();
  });

  it('Enforces cooldowns correctly for specified duration', () => {
    const cd1 = cooldowns.check('ping', 'user_1', 3);
    assert.equal(cd1, 0, 'First call should have 0 remaining cooldown');

    const cd2 = cooldowns.check('ping', 'user_1', 3);
    assert.ok(cd2 >= 2 && cd2 <= 3, `Expected ~3s cooldown, got ${cd2}`);

    // Different user should have separate bucket
    const cdOther = cooldowns.check('ping', 'user_2', 3);
    assert.equal(cdOther, 0, 'Different user should not be throttled');

    // Different command should have separate bucket
    const cdOtherCmd = cooldowns.check('help', 'user_1', 3);
    assert.equal(cdOtherCmd, 0, 'Different command should not be throttled');
  });

  it('Allows resetting user cooldown on demand', () => {
    cooldowns.check('ban', 'user_1', 10);
    assert.ok(cooldowns.check('ban', 'user_1', 10) > 0);

    cooldowns.reset('ban', 'user_1');
    assert.equal(cooldowns.check('ban', 'user_1', 10), 0);
  });

  it('Bounded cache prevents memory explosion', () => {
    for (let i = 0; i < 1000; i++) {
      cooldowns.check(`cmd_${i}`, `user_${i}`, 1);
    }
    assert.ok(cooldowns.size() <= 10000);
  });
});
