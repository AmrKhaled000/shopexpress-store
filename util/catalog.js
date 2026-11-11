'use strict';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'title-asc', label: 'Name: A to Z' }
];

const PRICE_OPTIONS = [
  { value: '', label: 'All prices' },
  { value: 'under-50', label: 'Under $50' },
  { value: '50-150', label: '$50 – $150' },
  { value: 'over-150', label: '$150 and above' }
];

const SORT_VALUES = new Set(SORT_OPTIONS.map(option => option.value));
const PRICE_VALUES = new Set(PRICE_OPTIONS.map(option => option.value));

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCatalogQuery(query = {}) {
  const search = normalizeText(query.q).slice(0, 80);
  const sort = SORT_VALUES.has(query.sort) ? query.sort : 'newest';
  const price = PRICE_VALUES.has(query.price) ? query.price : '';

  return {
    search,
    sort,
    price,
    sortOptions: SORT_OPTIONS,
    priceOptions: PRICE_OPTIONS,
    hasFilters: Boolean(search || price)
  };
}

function buildProductQuery(catalog) {
  const filter = {};

  if (catalog.search) {
    const pattern = new RegExp(escapeRegExp(catalog.search), 'i');
    filter.$or = [{ title: pattern }, { description: pattern }];
  }

  if (catalog.price === 'under-50') {
    filter.price = { $lt: 50 };
  } else if (catalog.price === '50-150') {
    filter.price = { $gte: 50, $lte: 150 };
  } else if (catalog.price === 'over-150') {
    filter.price = { $gt: 150 };
  }

  return filter;
}

function buildProductSort(sort) {
  switch (sort) {
    case 'price-asc':
      return { price: 1, _id: -1 };
    case 'price-desc':
      return { price: -1, _id: -1 };
    case 'title-asc':
      return { title: 1, _id: -1 };
    case 'newest':
    default:
      return { _id: -1 };
  }
}

module.exports = {
  SORT_OPTIONS,
  PRICE_OPTIONS,
  parseCatalogQuery,
  buildProductQuery,
  buildProductSort
};
