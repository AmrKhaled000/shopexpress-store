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

// Security and privacy headers -------------------------------------------------
app.use((req, res, next) => {
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
  res.status(500).render('500', {
    pageTitle: 'Server Error',
    path: '/500'
  });
});

const PORT = process.env.PORT || 3000;

const MONGOOSE_OPTIONS = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 15000
};
const MAX_CONNECT_ATTEMPTS = 4;

function connectWithRetry(attempt = 1) {
  return mongoose.connect(MONGODB_URI, MONGOOSE_OPTIONS).catch(error => {
    if (attempt >= MAX_CONNECT_ATTEMPTS) {
      throw error;
    }
    console.warn(`[db] Connection attempt ${attempt} failed (${error.message}). Retrying in 2s…`);
    return new Promise(resolve => setTimeout(resolve, 2000)).then(() => connectWithRetry(attempt + 1));
  });
}

connectWithRetry()
  .then(() => User.findOne({ isAdmin: true }))
  .then(adminUser => {
    if (!adminUser) {
      if (IS_PRODUCTION) {
        console.warn('[bootstrap] No admin account exists. The app will start without one; create it with `npm run seed`.');
        return null;
      }
      const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminEmail || !adminPassword) {
        console.warn('[bootstrap] No admin account exists. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env and run `npm run seed` (or restart) to create one.');
        return null;
      }
      const bcrypt = require('bcryptjs');
      return bcrypt.hash(adminPassword, 12).then(hashed => {
        const admin = new User({
          email: adminEmail,
          password: hashed,
          isAdmin: true,
          cart: { items: [] }
        });
        return admin.save().then(() => {
          console.log('[bootstrap] Created the development admin account from .env.');
        });
      });
    }
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`ShopExpress running at http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.error('Failed to start ShopExpress:', error.message);
    process.exit(1);
  });
