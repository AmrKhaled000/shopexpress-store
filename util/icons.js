'use strict';

const SAFE_ICON_NAME = /^[a-z0-9-]+$/;
const SAFE_CLASS_NAME = /^[a-zA-Z0-9 _-]*$/;

/**
 * Renders a <use> reference to the self-hosted icon sprite.
 * Icons are decorative by default; pass a label for meaningful icons.
 */
function icon(name, className = '', label = '') {
  if (!SAFE_ICON_NAME.test(String(name))) {
    return '';
  }
  const safeClass = SAFE_CLASS_NAME.test(className) ? className : '';
  const classes = ['icon', safeClass].filter(Boolean).join(' ');
  const accessibility = label
    ? `role="img" aria-label="${escapeAttribute(label)}"`
    : 'aria-hidden="true" focusable="false"';

  return `<svg class="${classes}" ${accessibility}><use href="/icons/sprite.svg#${name}"></use></svg>`;
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = icon;
