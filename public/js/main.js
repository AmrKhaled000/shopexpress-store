/* ============================================================================
   ShopExpress — front-end interactions
   No framework, no dependencies. Everything is progressive enhancement.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var prefersReducedMotion = false;
  try {
    prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (error) {
    prefersReducedMotion = false;
  }

  /* --------------------------------------------------------------------------
     Theme
     -------------------------------------------------------------------------- */
  var themeMeta = document.getElementById('meta-theme-color');

  function syncThemeControls() {
    var theme = root.getAttribute('data-theme') || 'light';
    var isDark = theme === 'dark';

    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      button.setAttribute('aria-label', 'Switch to ' + (isDark ? 'light' : 'dark') + ' theme');
    });

    document.querySelectorAll('[data-theme-label]').forEach(function (label) {
      label.textContent = isDark ? 'Light mode' : 'Dark mode';
    });

    if (themeMeta) {
      themeMeta.setAttribute('content', isDark ? '#12110F' : '#F5F1E8');
    }
  }

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem('shopexpress-theme', theme);
    } catch (error) {
      /* A blocked storage API should never break the page. */
    }
    syncThemeControls();
  }

  document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
    button.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      setTheme(next);
    });
  });

  syncThemeControls();

  /* --------------------------------------------------------------------------
     Sticky header shadow
     -------------------------------------------------------------------------- */
  var siteHeader = document.querySelector('[data-site-header]');

  if (siteHeader) {
    var updateHeader = function () {
      siteHeader.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    window.addEventListener('scroll', updateHeader, { passive: true });
    updateHeader();
  }

  /* --------------------------------------------------------------------------
     Mobile navigation
     -------------------------------------------------------------------------- */
  var menuButton = document.querySelector('[data-menu-open]');
  var drawer = document.getElementById('mobile-menu');
  var backdrop = document.querySelector('.backdrop');
  var menuCloseButtons = document.querySelectorAll('[data-menu-close]');
  var lastFocusedElement = null;
  var pageRegions = Array.prototype.filter.call(
    document.querySelectorAll('main, .site-footer'),
    Boolean
  );

  function isMenuOpen() {
    return drawer && drawer.classList.contains('open');
  }

  function openMenu() {
    if (!drawer || !backdrop) {
      return;
    }
    lastFocusedElement = document.activeElement;
    drawer.classList.add('open');
    backdrop.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-open');
    pageRegions.forEach(function (region) {
      region.setAttribute('inert', '');
    });
    if (menuButton) {
      menuButton.setAttribute('aria-expanded', 'true');
    }
    var closeButton = drawer.querySelector('.mobile-nav__close');
    if (closeButton) {
      window.setTimeout(function () {
        closeButton.focus();
      }, 80);
    }
  }

  function closeMenu(restoreFocus) {
    if (!drawer || !backdrop) {
      return;
    }
    drawer.classList.remove('open');
    backdrop.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');
    pageRegions.forEach(function (region) {
      region.removeAttribute('inert');
    });
    if (menuButton) {
      menuButton.setAttribute('aria-expanded', 'false');
    }
    if (restoreFocus && lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  if (menuButton && drawer && backdrop) {
    menuButton.addEventListener('click', openMenu);

    menuCloseButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        closeMenu(true);
      });
    });

    drawer.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        closeMenu(false);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (!isMenuOpen()) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      var focusable = Array.prototype.filter.call(
        drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        function (element) {
          return element.offsetParent !== null;
        }
      );

      if (focusable.length === 0) {
        return;
      }

      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 960 && isMenuOpen()) {
        closeMenu(false);
      }
    });
  }

  /* --------------------------------------------------------------------------
     Account popover (native <details>)
     -------------------------------------------------------------------------- */
  var accounts = Array.prototype.slice.call(document.querySelectorAll('[data-account]'));

  function closeOtherAccounts(current) {
    accounts.forEach(function (account) {
      if (account !== current) {
        account.removeAttribute('open');
      }
    });
  }

  accounts.forEach(function (account) {
    var summary = account.querySelector('summary');

    account.addEventListener('toggle', function () {
      if (account.open) {
        closeOtherAccounts(account);
      }
    });

    account.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && account.open) {
        account.removeAttribute('open');
        if (summary) {
          summary.focus();
        }
      }
    });
  });

  document.addEventListener('click', function (event) {
    accounts.forEach(function (account) {
      if (account.open && !account.contains(event.target)) {
        account.removeAttribute('open');
      }
    });
  });

  /* --------------------------------------------------------------------------
     Flash messages
     -------------------------------------------------------------------------- */
  document.querySelectorAll('[data-alert]').forEach(function (alert) {
    var close = alert.querySelector('[data-alert-close]');
    var timeout = null;

    function dismiss() {
      if (timeout) {
        window.clearTimeout(timeout);
      }
      alert.classList.add('is-leaving');
      window.setTimeout(function () {
        alert.remove();
      }, 300);
    }

    if (close) {
      close.addEventListener('click', dismiss);
    }

    if (alert.classList.contains('alert--success') || alert.classList.contains('alert--info')) {
      timeout = window.setTimeout(dismiss, 9000);
    }
  });

  /* --------------------------------------------------------------------------
     Confirm dialog for destructive actions
     -------------------------------------------------------------------------- */
  var confirmDialog = document.getElementById('confirm-dialog');
  var confirmMessage = document.getElementById('confirm-dialog-message');
  var confirmAccept = confirmDialog ? confirmDialog.querySelector('[data-confirm-accept]') : null;
  var confirmCancel = confirmDialog ? confirmDialog.querySelector('[data-confirm-cancel]') : null;
  var pendingForm = null;

  function supportsDialog() {
    return confirmDialog && typeof confirmDialog.showModal === 'function';
  }

  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (form.dataset.confirmed === 'true') {
        return;
      }

      event.preventDefault();
      var message = form.getAttribute('data-confirm') || 'Are you sure you want to continue?';

      if (!supportsDialog()) {
        if (window.confirm(message)) {
          form.dataset.confirmed = 'true';
          form.submit();
        }
        return;
      }

      pendingForm = form;
      if (confirmMessage) {
        confirmMessage.textContent = message;
      }
      document.body.classList.add('modal-open');
      confirmDialog.showModal();
      if (confirmAccept) {
        window.setTimeout(function () {
          confirmAccept.focus();
        }, 60);
      }
    });
  });

  function hideConfirmDialog() {
    pendingForm = null;
    document.body.classList.remove('modal-open');
    if (confirmDialog && confirmDialog.open) {
      confirmDialog.close();
    }
  }

  if (confirmDialog) {
    if (confirmCancel) {
      confirmCancel.addEventListener('click', hideConfirmDialog);
    }

    if (confirmAccept) {
      confirmAccept.addEventListener('click', function () {
        if (!pendingForm) {
          hideConfirmDialog();
          return;
        }
        var form = pendingForm;
        pendingForm = null;
        form.dataset.confirmed = 'true';
        document.body.classList.remove('modal-open');
        confirmDialog.close();
        form.submit();
      });
    }

    confirmDialog.addEventListener('click', function (event) {
      if (event.target === confirmDialog) {
        hideConfirmDialog();
      }
    });

    confirmDialog.addEventListener('cancel', function () {
      pendingForm = null;
      document.body.classList.remove('modal-open');
    });
  }

  /* --------------------------------------------------------------------------
     Form validation
     -------------------------------------------------------------------------- */
  function fieldContainer(field) {
    return field.closest('.form-field') || field.closest('.form-control');
  }

  function errorElementFor(container) {
    return container ? container.querySelector('.field-error') : null;
  }

  function setFieldInvalid(field, valid, message) {
    var container = fieldContainer(field);
    if (!container) {
      return;
    }

    var error = errorElementFor(container);
    container.classList.toggle('is-invalid', !valid);
    field.setAttribute('aria-invalid', valid ? 'false' : 'true');

    if (error) {
      if (!error.id) {
        error.id = (field.id || field.name || 'field') + '-error';
      }
      if (!valid) {
        error.textContent = message;
        field.setAttribute('aria-describedby', error.id);
      } else if (field.getAttribute('aria-describedby') === error.id) {
        field.removeAttribute('aria-describedby');
      }
    }
  }

  function validateField(field) {
    if (!field || field.type === 'hidden' || field.type === 'submit' || field.type === 'button') {
      return true;
    }

    var value = field.type === 'password' || field.type === 'email' || field.type === 'search'
      ? field.value.trim()
      : field.value.trim();
    var valid = true;
    var message = '';

    if (field.required && !value) {
      valid = false;
      message = 'This field is required.';
    } else if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      valid = false;
      message = 'Enter a valid email address.';
    } else if (field.type === 'url' && value) {
      var isLocalImage =
        value.indexOf('..') === -1 &&
        /^\/images\/[A-Za-z0-9/_.,-]+\.(svg|png|jpe?g|webp|avif|gif)$/i.test(value);
      if (!isLocalImage) {
        try {
          var url = new URL(value);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            valid = false;
            message = 'Use a full http:// or https:// URL.';
          }
        } catch (error) {
          valid = false;
          message = 'Use a full http:// or https:// URL.';
        }
      }
    } else if (field.type === 'number' && value) {
      var number = parseFloat(value);
      if (Number.isNaN(number)) {
        valid = false;
        message = 'Enter a valid number.';
      } else {
        var min = parseFloat(field.min);
        var max = parseFloat(field.max);
        if (!Number.isNaN(min) && number < min) {
          valid = false;
          message = 'Enter a value of at least ' + min + '.';
        } else if (!Number.isNaN(max) && number > max) {
          valid = false;
          message = 'Enter a value of at most ' + max + '.';
        }
      }
    } else if (field.dataset.minLength && value && value.length < parseInt(field.dataset.minLength, 10)) {
      valid = false;
      message = 'Use at least ' + field.dataset.minLength + ' characters.';
    }

    setFieldInvalid(field, valid, message);
    return valid;
  }

  document.querySelectorAll('form[data-validate]').forEach(function (form) {
    var fields = Array.prototype.filter.call(
      form.querySelectorAll('input, textarea, select'),
      function (field) {
        return ['hidden', 'submit', 'button', 'reset'].indexOf(field.type) === -1;
      }
    );

    fields.forEach(function (field) {
      field.addEventListener('blur', function () {
        validateField(field);
      });

      field.addEventListener('input', function () {
        var container = fieldContainer(field);
        if (container && container.classList.contains('is-invalid')) {
          validateField(field);
        }
      });
    });

    form.addEventListener('submit', function (event) {
      var valid = true;

      fields.forEach(function (field) {
        if (!validateField(field)) {
          valid = false;
        }
      });

      var password = form.querySelector('input[name="password"]');
      var confirmation = form.querySelector('input[name="confirmPassword"]');
      if (password && confirmation) {
        if (confirmation.value && password.value !== confirmation.value) {
          setFieldInvalid(confirmation, false, 'Passwords do not match.');
          valid = false;
        } else if (!confirmation.value) {
          setFieldInvalid(confirmation, false, 'Confirm your password.');
          valid = false;
        }
      }

      if (!valid) {
        event.preventDefault();
        var firstInvalid = form.querySelector('.form-field.is-invalid input, .form-field.is-invalid textarea, .form-field.is-invalid select');
        if (firstInvalid) {
          firstInvalid.focus();
        }
        return;
      }

      var submitButton = form.querySelector('button[type="submit"]');
      if (submitButton && !submitButton.disabled) {
        submitButton.disabled = true;
        submitButton.classList.add('is-loading');
        if (!submitButton.querySelector('.btn__spinner')) {
          var spinner = document.createElement('span');
          spinner.className = 'btn__spinner';
          spinner.setAttribute('aria-hidden', 'true');
          submitButton.prepend(spinner);
        }
      }
    });
  });

  /* --------------------------------------------------------------------------
     Password visibility + strength
     -------------------------------------------------------------------------- */
  document.querySelectorAll('[data-password-toggle]').forEach(function (button) {
    var wrap = button.closest('.input-wrap');
    var input = wrap ? wrap.querySelector('input') : null;
    var showIcon = button.querySelector('[data-password-show]');
    var hideIcon = button.querySelector('[data-password-hide]');

    if (!input) {
      return;
    }

    button.addEventListener('click', function () {
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.setAttribute('aria-pressed', showing ? 'false' : 'true');
      button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      if (showIcon) {
        showIcon.hidden = !showing;
      }
      if (hideIcon) {
        hideIcon.hidden = showing;
      }
      input.focus();
    });
  });

  function scorePassword(value) {
    if (!value) {
      return 0;
    }
    var score = 0;
    if (value.length >= 6) {
      score += 1;
    }
    if (value.length >= 10) {
      score += 1;
    }
    if (/[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value)) {
      score += 1;
    }
    if (/[^A-Za-z0-9]/.test(value) && value.length >= 8) {
      score += 1;
    }
    return Math.min(score, 4);
  }

  document.querySelectorAll('[data-strength-source]').forEach(function (input) {
    var container = input.closest('.form-field');
    var meter = container ? container.querySelector('[data-strength]') : null;
    var label = meter ? meter.querySelector('[data-strength-label]') : null;
    var messages = [
      'Use 6 or more characters.',
      'A little longer would help.',
      'Good — add a number or symbol.',
      'Strong password.',
      'Excellent password.'
    ];

    if (!meter) {
      return;
    }

    function update() {
      if (!input.value) {
        meter.hidden = true;
        meter.removeAttribute('data-score');
        return;
      }
      var score = scorePassword(input.value);
      meter.hidden = false;
      meter.setAttribute('data-score', String(score));
      if (label) {
        label.textContent = messages[score] || messages[0];
      }
    }

    input.addEventListener('input', update);
    update();
  });

  /* --------------------------------------------------------------------------
     Catalog filter auto-submit
     -------------------------------------------------------------------------- */
  document.querySelectorAll('form[data-auto-filter]').forEach(function (form) {
    form.querySelectorAll('select').forEach(function (select) {
      select.addEventListener('change', function () {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.submit();
        }
      });
    });
  });

  /* --------------------------------------------------------------------------
     Admin catalog filter (client-side)
     -------------------------------------------------------------------------- */
  var tableFilter = document.querySelector('[data-table-filter]');
  var filterTable = document.querySelector('[data-filter-table]');

  if (tableFilter && filterTable) {
    var filterRows = filterTable.querySelectorAll('[data-filter-row]');
    var emptyRow = filterTable.querySelector('[data-filter-empty]');

    var applyTableFilter = function () {
      var term = tableFilter.value.trim().toLowerCase();
      var visible = 0;

      filterRows.forEach(function (row) {
        var matches = !term || row.textContent.toLowerCase().indexOf(term) !== -1;
        row.hidden = !matches;
        if (matches) {
          visible += 1;
        }
      });

      if (emptyRow) {
        emptyRow.hidden = visible !== 0;
      }
    };

    tableFilter.addEventListener('input', applyTableFilter);
    applyTableFilter();
  }

  /* --------------------------------------------------------------------------
     Admin product form — live preview
     -------------------------------------------------------------------------- */
  var productForm = document.querySelector('[data-product-form]');
  var currency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  if (productForm) {
    var titleInput = productForm.querySelector('[data-preview-title]');
    var priceInput = productForm.querySelector('[data-preview-price]');
    var descriptionInput = productForm.querySelector('[data-preview-description]');
    var filesInput = productForm.querySelector('[data-preview-files]');
    var titleOutput = productForm.querySelector('[data-preview-title-output]');
    var priceOutput = productForm.querySelector('[data-preview-price-output]');
    var descriptionOutput = productForm.querySelector('[data-preview-description-output]');
    var imageOutput = productForm.querySelector('[data-preview-image]');
    var descriptionCounter = productForm.querySelector('[data-description-counter]');
    var placeholder = '/images/placeholder.svg';

    function truncated(text, max) {
      var value = String(text || '').trim();
      if (value.length <= max) {
        return value;
      }
      return value.slice(0, max).trimEnd() + '…';
    }

    function updatePreview() {
      if (titleInput && titleOutput) {
        titleOutput.textContent = titleInput.value.trim() || 'Your product title';
      }
      if (priceInput && priceOutput) {
        var amount = parseFloat(priceInput.value);
        priceOutput.textContent = currency.format(Number.isFinite(amount) ? amount : 0);
      }
      if (descriptionInput && descriptionOutput) {
        descriptionOutput.textContent = truncated(descriptionInput.value, 86) || 'A short description of the object will appear here.';
      }
      if (descriptionInput && descriptionCounter) {
        descriptionCounter.textContent = descriptionInput.value.length.toLocaleString('en-US') + ' / 2,000';
      }
    }

    if (filesInput && imageOutput) {
      filesInput.addEventListener('change', function () {
        var first = filesInput.files && filesInput.files[0];
        if (!first || !/^image\//.test(first.type)) {
          return;
        }
        var objectUrl = URL.createObjectURL(first);
        imageOutput.src = objectUrl;
        imageOutput.addEventListener('load', function () {
          URL.revokeObjectURL(objectUrl);
        }, { once: true });
      });
    }

    [titleInput, priceInput, descriptionInput].forEach(function (input) {
      if (input) {
        input.addEventListener('input', updatePreview);
      }
    });

    if (imageOutput) {
      imageOutput.addEventListener('error', function () {
        if (!imageOutput.src.endsWith(placeholder)) {
          imageOutput.src = placeholder;
        }
      });
    }

    updatePreview();
  }

  /* --------------------------------------------------------------------------
     Product page — gallery thumbnails
     -------------------------------------------------------------------------- */
  var galleryMain = document.querySelector('[data-gallery-main]');
  var galleryThumbs = document.querySelectorAll('[data-gallery-thumb]');

  if (galleryMain && galleryThumbs.length > 0) {
    galleryThumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        var nextSource = thumb.getAttribute('data-gallery-thumb');
        if (nextSource) {
          galleryMain.src = nextSource;
        }
        galleryThumbs.forEach(function (other) {
          var active = other === thumb;
          other.classList.toggle('is-active', active);
          other.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      });
    });
  }

  /* --------------------------------------------------------------------------
     Broken product images fall back to an illustrated placeholder
     -------------------------------------------------------------------------- */
  var fallback = '/images/placeholder.svg';

  document.addEventListener(
    'error',
    function (event) {
      var image = event.target;
      if (!image || image.tagName !== 'IMG') {
        return;
      }
      if (image.dataset.fallbackApplied === 'true') {
        return;
      }
      var current = image.getAttribute('src') || '';
      if (current.indexOf('placeholder.svg') !== -1) {
        return;
      }
      image.dataset.fallbackApplied = 'true';
      image.classList.add('is-fallback');
      image.src = fallback;
    },
    true
  );

  /* --------------------------------------------------------------------------
     Reveal-on-scroll
     -------------------------------------------------------------------------- */
  var revealElements = document.querySelectorAll('.reveal');

  if (revealElements.length > 0 && !prefersReducedMotion && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );

    revealElements.forEach(function (element) {
      observer.observe(element);
    });
  } else {
    revealElements.forEach(function (element) {
      element.classList.add('is-visible');
    });
  }
})();
