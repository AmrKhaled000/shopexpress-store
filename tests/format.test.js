'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { formatPrice, formatDate, pluralize, initials, truncate } = require('../util/format');

test('formatPrice formats USD with two decimals', () => {
  assert.equal(formatPrice(189), '$189.00');
  assert.equal(formatPrice('1234.5'), '$1,234.50');
  assert.equal(formatPrice(0), '$0.00');
});

test('formatPrice handles invalid input gracefully', () => {
  assert.equal(formatPrice(null), '$0.00');
  assert.equal(formatPrice('not a price'), '$0.00');
  assert.equal(formatPrice(undefined), '$0.00');
});

test('formatDate renders long and short variants', () => {
  const date = new Date(2026, 10, 7);
  assert.equal(formatDate(date), 'November 7, 2026');
  assert.equal(formatDate(date, { short: true }), 'Nov 7, 2026');
});

test('formatDate handles empty and invalid values', () => {
  assert.equal(formatDate(null), '');
  assert.equal(formatDate(undefined), '');
  assert.equal(formatDate('not a date'), '');
});

test('pluralize picks the right noun', () => {
  assert.equal(pluralize(0, 'object'), '0 objects');
  assert.equal(pluralize(1, 'object'), '1 object');
  assert.equal(pluralize(2, 'object'), '2 objects');
  assert.equal(pluralize(2, 'category', 'categories'), '2 categories');
});

test('initials produces a single safe letter', () => {
  assert.equal(initials('amr@example.com'), 'A');
  assert.equal(initials('  _@example.com'), 'E');
  assert.equal(initials(''), '?');
  assert.equal(initials(null), '?');
});

test('truncate respects the limit and adds an ellipsis', () => {
  assert.equal(truncate('short', 10), 'short');
  assert.equal(truncate('a longer sentence', 6), 'a long…');
  assert.equal(truncate('  padded  ', 20), 'padded');
});
