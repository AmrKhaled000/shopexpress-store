'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseCatalogQuery,
  buildProductQuery,
  buildProductSort
} = require('../util/catalog');

test('parseCatalogQuery falls back to safe defaults', () => {
  const catalog = parseCatalogQuery({});
  assert.equal(catalog.search, '');
  assert.equal(catalog.sort, 'newest');
  assert.equal(catalog.price, '');
  assert.equal(catalog.hasFilters, false);
});

test('parseCatalogQuery normalises search and accepts known filters', () => {
  const catalog = parseCatalogQuery({
    q: '  quiet   lamp  ',
    sort: 'price-asc',
    price: 'over-150'
  });
  assert.equal(catalog.search, 'quiet lamp');
  assert.equal(catalog.sort, 'price-asc');
  assert.equal(catalog.price, 'over-150');
  assert.equal(catalog.hasFilters, true);
});

test('parseCatalogQuery rejects unknown sort and price values', () => {
  const catalog = parseCatalogQuery({ sort: 'drop-tables', price: 'free' });
  assert.equal(catalog.sort, 'newest');
  assert.equal(catalog.price, '');
  assert.equal(catalog.hasFilters, false);
});

test('parseCatalogQuery limits the search length', () => {
  const catalog = parseCatalogQuery({ q: 'x'.repeat(200) });
  assert.equal(catalog.search.length, 80);
});

test('buildProductQuery escapes regular-expression characters', () => {
  const catalog = parseCatalogQuery({ q: '100$ (edition)' });
  const filter = buildProductQuery(catalog);
  const pattern = filter.$or[0].title;
  assert.equal(pattern.test('100$ (edition)'), true);
  assert.equal(pattern.test('1000 edition'), false);
});

test('buildProductQuery applies price ranges', () => {
  const under = buildProductQuery(parseCatalogQuery({ price: 'under-50' }));
  assert.deepEqual(under.price, { $lt: 50 });

  const middle = buildProductQuery(parseCatalogQuery({ price: '50-150' }));
  assert.deepEqual(middle.price, { $gte: 50, $lte: 150 });

  const over = buildProductQuery(parseCatalogQuery({ price: 'over-150' }));
  assert.deepEqual(over.price, { $gt: 150 });
});

test('buildProductSort maps each public sort option', () => {
  assert.deepEqual(buildProductSort('newest'), { _id: -1 });
  assert.deepEqual(buildProductSort('price-asc'), { price: 1, _id: -1 });
  assert.deepEqual(buildProductSort('price-desc'), { price: -1, _id: -1 });
  assert.deepEqual(buildProductSort('title-asc'), { title: 1, _id: -1 });
  assert.deepEqual(buildProductSort('unknown'), { _id: -1 });
});

test('a search with only whitespace does not filter the catalog', () => {
  const catalog = parseCatalogQuery({ q: '   ' });
  assert.deepEqual(buildProductQuery(catalog), {});
  assert.equal(catalog.hasFilters, false);
});
