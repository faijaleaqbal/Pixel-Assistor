// test/mathEval.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate } = require('../utils/mathEval');

describe('Safe Math Evaluator (Deterministic AST)', () => {
  it('Evaluates basic arithmetic correctly', () => {
    assert.equal(evaluate('1 + 1'), 2);
    assert.equal(evaluate('10 - 4'), 6);
    assert.equal(evaluate('3 * 7'), 21);
    assert.equal(evaluate('20 / 4'), 5);
    assert.equal(evaluate('10 % 3'), 1);
    assert.equal(evaluate('2 ^ 3'), 8);
    assert.equal(evaluate('2 ** 4'), 16);
  });

  it('Respects standard operator precedence', () => {
    assert.equal(evaluate('2 + 3 * 4'), 14);
    assert.equal(evaluate('(2 + 3) * 4'), 20);
    assert.equal(evaluate('100 - 20 * 2 + 10 / 2'), 65);
    assert.equal(evaluate('2 ^ 3 ^ 2'), 512); // Right-associative 2^(3^2) = 2^9 = 512
  });

  it('Handles decimals and floating point numbers', () => {
    assert.equal(evaluate('3.5 + 2.5'), 6);
    assert.equal(evaluate('0.1 * 10'), 1);
    assert.equal(evaluate('12.5 / 2.5'), 5);
  });

  it('Handles unary negative and positive signs', () => {
    assert.equal(evaluate('-5 + 10'), 5);
    assert.equal(evaluate('10 + -5'), 5);
    assert.equal(evaluate('-(5 + 3) * 2'), -16);
  });

  it('Throws on division or modulo by zero', () => {
    assert.throws(() => evaluate('10 / 0'), /Division by zero/);
    assert.throws(() => evaluate('10 % 0'), /Modulo by zero/);
  });

  it('Rejects malicious / non-math tokens (zero code injection)', () => {
    assert.throws(() => evaluate('process.exit()'), /Invalid character/);
    assert.throws(() => evaluate('console.log("hello")'), /Invalid character/);
    assert.throws(() => evaluate('fetch("https://google.com")'), /Invalid character/);
    assert.throws(() => evaluate('global.foo = 1'), /Invalid character/);
    assert.throws(() => evaluate(''), /Empty expression/);
  });

  it('Rejects mismatched parentheses and invalid syntax', () => {
    assert.throws(() => evaluate('((2 + 3)'), /Mismatched parentheses/);
    assert.throws(() => evaluate('(2 + 3))'), /Mismatched parentheses/);
    assert.throws(() => evaluate('2 + * 3'), /Invalid syntax/);
  });
});
