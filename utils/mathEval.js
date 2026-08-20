// src/utils/mathEval.js
// Safe, deterministic arithmetic expression parser & evaluator (Shunting-Yard algorithm).
// Zero eval, zero new Function(), zero code execution.

const MAX_EXPR_LEN = 500;
const MAX_TOKENS = 100;
const MAX_PAREN_DEPTH = 30;

function tokenize(expr) {
  const s = String(expr || '').trim();
  if (s.length > MAX_EXPR_LEN) {
    throw new Error(`Expression too long (max ${MAX_EXPR_LEN} characters)`);
  }

  const tokens = [];
  let i = 0;
  let parenDepth = 0;

  while (i < s.length) {
    if (tokens.length >= MAX_TOKENS) {
      throw new Error(`Expression too complex (max ${MAX_TOKENS} tokens)`);
    }

    const ch = s[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < s.length && (/[0-9.]/.test(s[i]) || ((s[i] === 'e' || s[i] === 'E') && /[0-9+-]/.test(s[i + 1] || '')))) {
        numStr += s[i];
        // If scientific notation sign
        if ((s[i] === 'e' || s[i] === 'E') && (s[i + 1] === '+' || s[i + 1] === '-')) {
          i++;
          numStr += s[i];
        }
        i++;
      }
      const num = parseFloat(numStr);
      if (isNaN(num)) throw new Error(`Invalid number: ${numStr}`);
      tokens.push({ type: 'number', value: num });
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%' || ch === '^') {
      // Check for power operator **
      if (ch === '*' && s[i + 1] === '*') {
        tokens.push({ type: 'operator', value: '^', precedence: 4, assoc: 'right' });
        i += 2;
        continue;
      }

      // Check for unary minus / plus
      const prev = tokens[tokens.length - 1];
      const isUnary = !prev || prev.type === 'operator' || prev.type === 'lparen';

      if (isUnary && (ch === '-' || ch === '+')) {
        if (ch === '-') {
          tokens.push({ type: 'unary', value: 'u-', precedence: 5, assoc: 'right' });
        }
        i++;
        continue;
      }

      let prec = 2;
      let assoc = 'left';
      if (ch === '*' || ch === '/' || ch === '%') prec = 3;
      if (ch === '^') { prec = 4; assoc = 'right'; }

      tokens.push({ type: 'operator', value: ch, precedence: prec, assoc });
      i++;
      continue;
    }

    if (ch === '(') {
      parenDepth++;
      if (parenDepth > MAX_PAREN_DEPTH) throw new Error(`Parentheses nesting too deep (max ${MAX_PAREN_DEPTH})`);
      tokens.push({ type: 'lparen', value: '(' });
      i++;
      continue;
    }

    if (ch === ')') {
      parenDepth--;
      if (parenDepth < 0) throw new Error('Mismatched parentheses');
      tokens.push({ type: 'rparen', value: ')' });
      i++;
      continue;
    }

    throw new Error(`Invalid character: "${ch}"`);
  }

  return tokens;
}

function toRpn(tokens) {
  const outputQueue = [];
  const operatorStack = [];

  for (const token of tokens) {
    if (token.type === 'number') {
      outputQueue.push(token);
    } else if (token.type === 'operator' || token.type === 'unary') {
      while (operatorStack.length > 0) {
        const top = operatorStack[operatorStack.length - 1];
        if (
          top.type === 'operator' || top.type === 'unary'
        ) {
          if (
            (token.assoc === 'left' && token.precedence <= top.precedence) ||
            (token.assoc === 'right' && token.precedence < top.precedence)
          ) {
            outputQueue.push(operatorStack.pop());
            continue;
          }
        }
        break;
      }
      operatorStack.push(token);
    } else if (token.type === 'lparen') {
      operatorStack.push(token);
    } else if (token.type === 'rparen') {
      let foundLparen = false;
      while (operatorStack.length > 0) {
        const top = operatorStack.pop();
        if (top.type === 'lparen') {
          foundLparen = true;
          break;
        }
        outputQueue.push(top);
      }
      if (!foundLparen) throw new Error('Mismatched parentheses');
    }
  }

  while (operatorStack.length > 0) {
    const top = operatorStack.pop();
    if (top.type === 'lparen' || top.type === 'rparen') {
      throw new Error('Mismatched parentheses');
    }
    outputQueue.push(top);
  }

  return outputQueue;
}

function evaluateRpn(rpn) {
  const stack = [];

  for (const token of rpn) {
    if (token.type === 'number') {
      stack.push(token.value);
    } else if (token.type === 'unary' && token.value === 'u-') {
      if (stack.length < 1) throw new Error('Invalid syntax: missing operand for unary minus');
      const val = stack.pop();
      stack.push(-val);
    } else if (token.type === 'operator') {
      if (stack.length < 2) throw new Error('Invalid syntax: missing operands');
      const b = stack.pop();
      const a = stack.pop();

      let res;
      switch (token.value) {
        case '+': res = a + b; break;
        case '-': res = a - b; break;
        case '*': res = a * b; break;
        case '/':
          if (b === 0) throw new Error('Division by zero');
          res = a / b;
          break;
        case '%':
          if (b === 0) throw new Error('Modulo by zero');
          res = a % b;
          break;
        case '^':
          if (a === 0 && b < 0) throw new Error('Division by zero');
          if (b > 10000 || b < -10000) throw new Error('Exponent too large');
          res = Math.pow(a, b);
          break;
        default: throw new Error(`Unknown operator: ${token.value}`);
      }

      if (!Number.isFinite(res)) throw new Error('Calculation resulted in non-finite number');
      stack.push(res);
    }
  }

  if (stack.length !== 1) throw new Error('Invalid expression syntax');
  return stack[0];
}

function evaluate(expression) {
  if (!expression || !String(expression).trim()) {
    throw new Error('Empty expression');
  }
  const tokens = tokenize(expression);
  if (!tokens.length) throw new Error('Empty expression');
  const rpn = toRpn(tokens);
  return evaluateRpn(rpn);
}

module.exports = { evaluate };
