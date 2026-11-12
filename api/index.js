'use strict';

/**
 * Vercel serverless entry point.
 *
 * The right pattern on Vercel is to cache the connection ONCE per lambda,
 * check mongoose.connection.readyState before reusing it, and fail fast
 * instead of buffering when the socket is dead (freeze/thaw cycle).
 */

const mongoose = require('mongoose');
const app = require('../app');

const MONGODB_URI = process.env.MONGODB_URI;
const MONGOOSE_OPTIONS = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 20000,
  bufferCommands: false
};
const MAX_CONNECT_ATTEMPTS = 4;

let cached = global.__shopexpressDb;
if (!cached) {
  cached = global.__shopexpressDb = { conn: null, promise: null };
}

async function ensureDatabase() {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }
  if (!cached.promise) {
    cached.promise = connectWithRetry().catch(error => {
      cached.promise = null; // next request gets another attempt
      throw error;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

function connectWithRetry(attempt = 1) {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose);
  }
  return mongoose.connect(MONGODB_URI, MONGOOSE_OPTIONS).catch(error => {
    if (attempt >= MAX_CONNECT_ATTEMPTS) {
      throw error;
    }
    console.warn(`[vercel] database connection attempt ${attempt} failed (${error.message}); retrying…`);
    return new Promise(resolve => setTimeout(resolve, 1500)).then(() => connectWithRetry(attempt + 1));
  });
}

module.exports = async (req, res) => {
  if (!MONGODB_URI) {
    console.error('[vercel] MONGODB_URI is not set');
    res.statusCode = 503;
    res.setHeader('content-type', 'text/plain');
    res.end('ShopExpress is temporarily unavailable.');
    return;
  }
  try {
    await ensureDatabase();
  } catch (error) {
    console.error('[vercel] Database connection failed:', error.stack || error.message);
    res.statusCode = 503;
    res.setHeader('content-type', 'text/plain');
    res.end('ShopExpress is temporarily unavailable.');
    return;
  }
  return app(req, res);
};
