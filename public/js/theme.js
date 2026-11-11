/* Set the colour scheme before the first paint to avoid a flash. */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var stored = null;
  try {
    stored = window.localStorage.getItem('shopexpress-theme');
  } catch (error) {
    stored = null;
  }

  var prefersDark = false;
  try {
    prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (error) {
    prefersDark = false;
  }

  var theme = stored === 'light' || stored === 'dark' ? stored : prefersDark ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);

  var meta = document.getElementById('meta-theme-color');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#12110F' : '#F5F1E8');
  }
})();
