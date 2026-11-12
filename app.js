'use strict';

const path = require('path');

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const csrf = require('csurf');
const flash = require('connect-flash');

const errorController = require('./controllers/error');
const User = require('./models/user');
const icon = require('./util/icons');
const { formatPrice, formatDate, pluralize, initials, truncate } = require('./util/format');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shopexpress';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (!process.env.MONGODB_URI) {
  if (IS_PRODUCTION) {
    console.error('[config] MONGODB_URI is required in production.');
    process.exit(1);
  }
  console.warn('[config] MONGODB_URI is not set. Falling back to the local development database.');
}

const SESSION_SECRET =
  process.env.SESSION_SECRET || (IS_PRODUCTION ? '' : 'shopexpress-local-dev-secret');

if (!SESSION_SECRET) {
  console.error('[config] SESSION_SECRET is required in production.');
  process.exit(1);
}

const app = express();

app.disable('x-powered-by');
// Render/Heroku-style proxies terminate TLS and forward over plain HTTP.
// Trusting the first proxy hop lets `secure` session cookies work correctly.
app.set('trust proxy', 1);

// Security and privacy headers -------------------------------------------------
app.use((req, res, next) => {
  res.setHeader('X-Probe', 'yes');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data: blob: http: https:",
    "connect-src 'self'"
  ];
  if (IS_PRODUCTION) {
    policy.push('upgrade-insecure-requests');
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  res.setHeader('Content-Security-Policy', policy.join('; '));
  next();
});

const store = new MongoDBStore({
  uri: MONGODB_URI,
  collection: 'sessions'
});

store.on('error', error => {
  console.error('[session] Store error:', error.message);
});

const csrfProtection = csrf();

app.set('view engine', 'ejs');
app.set('views', 'views');

const adminRoutes = require('./routes/admin');
const shopRoutes = require('./routes/shop');
const authRoutes = require('./routes/auth');

// View helpers ---------------------------------------------------------------
app.locals.icon = icon;
app.locals.formatPrice = formatPrice;
app.locals.formatDate = formatDate;
app.locals.pluralize = pluralize;
app.locals.initials = initials;
app.locals.truncate = truncate;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: IS_PRODUCTION ? '1h' : 0 }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: store,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PRODUCTION,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

// Baseline view locals: these keep error pages renderable even when a request
// fails early (for example, on CSRF validation).
app.use((req, res, next) => {
  res.locals.isAuthenticated = Boolean(req.session && req.session.isLoggedIn);
  res.locals.isAdmin = false;
  res.locals.userEmail = '';
  res.locals.csrfToken = '';
  res.locals.cartCount = 0;
  res.locals.path = req.path;
  res.locals.searchQuery = '';
  res.locals.currentYear = new Date().getFullYear();
  res.locals.flashMessage = null;
  res.locals.flashType = 'info';
  next();
});

app.use(csrfProtection);
app.use(flash());

app.use((req, res, next) => {
  const success = req.flash('success');
  const error = req.flash('error');
  const info = req.flash('info');
  if (success.length > 0) {
    res.locals.flashMessage = success[0];
    res.locals.flashType = 'success';
  } else if (error.length > 0) {
    res.locals.flashMessage = error[0];
    res.locals.flashType = 'error';
  } else if (info.length > 0) {
    res.locals.flashMessage = info[0];
    res.locals.flashType = 'info';
  } else {
    res.locals.flashMessage = null;
    res.locals.flashType = 'info';
  }
  next();
});

app.use((req, res, next) => {
  if (!req.session.user) {
    return next();
  }
  User.findById(req.session.user._id)
    .then(user => {
      if (!user) {
        return req.session.destroy(() => res.redirect('/login'));
      }
      req.user = user;
      next();
    })
    .catch(next);
});

app.use((req, res, next) => {
  res.locals.isAuthenticated = Boolean(req.session.isLoggedIn);
  res.locals.userEmail = req.user ? req.user.email : '';
  res.locals.csrfToken = req.csrfToken();
  res.locals.path = req.path;
  res.locals.isAdmin = Boolean(req.user && req.user.isAdmin === true);
  res.locals.cartCount =
    req.user && req.user.cart
      ? req.user.cart.items.reduce((sum, item) => sum + item.quantity, 0)
      : 0;
  res.locals.searchQuery = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : '';
  res.locals.currentYear = new Date().getFullYear();
  next();
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.use('/admin', adminRoutes);
app.use(shopRoutes);
app.use(authRoutes);

app.use(errorController.get404);

app.use((error, req, res, next) => {
  if (error.code === 'EBADCSRFTOKEN') {
    return res.status(403).render('403', {
      pageTitle: 'Access Denied',
      path: '/403'
    });
  }
  console.error(error);
  if (res.headersSent) {
    return next(error);
  }
  if (String(req.query && req.query.debug) === '1') {
    res.status(500);
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    return res.end('DEBUG_ERROR:\n' + String((error && (error.stack || error.message)) || 'unknown'));
  }
  res.status(500).render('500', {
    pageTitle: 'Server Error',
    path: '/500'
  });
});

module.exports = app;
