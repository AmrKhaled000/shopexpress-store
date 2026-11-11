'use strict';

/**
 * Standalone entry point for classic (non-serverless) deployments:
 * local development, Render, a VPS, Docker, etc.
 *
 * Vercel deployments use api/index.js instead — the same exported app,
 * but with a cached MongoDB connection per serverless instance.
 */

const app = require('./app');
const mongoose = require('mongoose');
const User = require('./models/user');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shopexpress';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

if (!process.env.MONGODB_URI) {
  if (IS_PRODUCTION) {
    console.error('[config] MONGODB_URI is required in production.');
    process.exit(1);
  }
  console.warn('[config] MONGODB_URI is not set. Falling back to the local development database.');
}

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
    return null;
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
