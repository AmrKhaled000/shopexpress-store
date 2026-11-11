'use strict';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatPrice(value) {
  const numeric = Number(value);
  return currencyFormatter.format(Number.isFinite(numeric) ? numeric : 0);
}

function formatDate(value, options = {}) {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: options.short ? 'short' : 'long',
    day: 'numeric'
  }).format(date);
}

function pluralize(count, singular, plural) {
  const label = Number(count) === 1 ? singular : plural || `${singular}s`;
  return `${count} ${label}`;
}

function initials(email) {
  const letters = String(email || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 1)
    .toUpperCase();
  return letters || '?';
}

function truncate(text, maxLength = 120) {
  const value = String(text || '').trim();
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength).trimEnd()}…`;
}

module.exports = {
  formatPrice,
  formatDate,
  pluralize,
  initials,
  truncate
};
