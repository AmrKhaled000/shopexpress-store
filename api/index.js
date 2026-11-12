'use strict';

/**
 * Vercel serverless entry point.
 *
 * vercel.json routes all non-file requests to this function. Static files in
 * `public/` are served by Vercel's CDN (filesystem takes precedence over the
 * rewrite), so only application requests hit this handler.
 *
 * Serverless instances are reused for many invocations but must reconnect to
 * MongoDB after cold starts — the connection is cached on the global object.
 */

const mongoose = require('mongoose');
let app;
try {
  app = require('../app');
} catch (error) {
  const failing = error;
  module.exports = async (req, res) => {
    res.statusCode = 500;
    res.end('boot failed: ' + String(failing && (failing.stack || failing.message)).slice(0, 1500));
  };
  return;
}

const MONGODB_URI = process.env.MONGODB_URI;
const MONGOOSE_OPTIONS = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
};
const MAX_CONNECT_ATTEMPTS = 3;

let cached = global.__shopexpressMongoose;
if (!cached) {
  cached = global.__shopexpressMongoose = { conn: null, promise: null };
}

async function ensureDatabase() {
  if (cached.conn) {
    return cached.conn;
  }
  if (!cached.promise) {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is required in this environment (see README).');
    }
    cached.promise = connectWithRetry().catch(error => {
      cached.promise = null; // allow the next request to retry
      throw error;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

function connectWithRetry(attempt = 1) {
  return mongoose.connect(MONGODB_URI, MONGOOSE_OPTIONS).catch(error => {
    if (attempt >= MAX_CONNECT_ATTEMPTS) {
      throw error;
    }
    console.warn(`[vercel] database connection attempt ${attempt} failed (${error.message}); retrying…`);
    return new Promise(resolve => setTimeout(resolve, 1000)).then(() => connectWithRetry(attempt + 1));
  });
}

module.exports = async (req, res) => {
  const url = req && req.url ? String(req.url) : '';
  if (url.startsWith('/_node')) {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ version: process.version, execArgv: process.execArgv }));
    return;
  }
  try {
    await ensureDatabase();
  } catch (error) {
    console.error('[vercel] Database connection failed:', error.stack || error.message);
    res.statusCode = 503;
    res.end('ShopExpress is temporarily unavailable. ' + String(error.stack || error.message).slice(0, 800));
    return;
  }
  return app(req, res);
};
