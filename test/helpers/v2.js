// test/helpers/v2.js
// Utilities for asserting Components V2 builders/payloads in tests.

function nodeJson(node) {
  if (!node) return null;
  return typeof node.toJSON === 'function' ? node.toJSON() : node;
}

// Recursively extracts all TextDisplay content from a builder, raw JSON, or reply payload.
function v2Text(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  const json = nodeJson(node);
  if (Array.isArray(json)) return json.map(v2Text).join('\n');
  if (json.type === 10 && json.content !== undefined) return String(json.content);
  if (Array.isArray(json.components)) return json.components.map(v2Text).join('\n');
  return '';
}

// Finds every ActionRow JSON inside a payload/container tree.
function v2Rows(node) {
  const rows = [];
  (function walk(n) {
    const json = nodeJson(n);
    if (!json) return;
    if (Array.isArray(json)) {
      json.forEach(walk);
      return;
    }
    if (json.type === 1) {
      rows.push(json);
      return;
    }
    if (Array.isArray(json.components)) json.components.forEach(walk);
  })(node);
  return rows;
}

module.exports = v2Text;
module.exports.v2Text = v2Text;
module.exports.v2Rows = v2Rows;
