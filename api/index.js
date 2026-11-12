'use strict';

const mongoose = require('mongoose');
const app = require('../app');

const MONGODB_URI = process.env.MONGODB_URI;
const MONGOOSE_OPTIONS = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 15000
};
const MAX_CONNECT_ATTEMPTS = 4;

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
      cached.promise = null;
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

  if (url.startsWith('/_probe/app/index-data')) {
    try {
      const Product = require('../models/product');
      const t = Date.now();
      const products = await Product.find().sort({ _id: -1 }).limit(3).exec();
      const count = await Product.countDocuments();
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        ms: Date.now() - t,
        count,
        sample: products.map(p => ({ id: p._id.toString(), title: p.title, imageUrl: p.imageUrl }))
      }, null, 2));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('content-type', 'text/plain');
      res.end('probe failed:\n' + (error && (error.stack || error.message)));
    }
    return;
  }

  if (url.startsWith('/_probe/app')) {
    try {
      await ensureDatabase();
      const t = Date.now();
      app(req, res);
      setImmediate(() => {
        // If app() dispatches synchronously, this fires before the response finishes.
        res.setHeader('x-app-dispatched', `${Date.now() - t}ms`);
      });
    } catch (error) {
      res.statusCode = 500;
      res.end(`app dispatch threw: ${error && (error.name + ' — ' + error.message)}`);
    }
    return;
  }

  if (url.startsWith('/_probe')) {
    try {
      const t = Date.now();
      await ensureDatabase();
      res.statusCode = 200;
      res.setHeader('content-type', 'text/plain');
      res.end(`ensureDatabase ok, readyState=${mongoose.connection.readyState}, ms=${Date.now() - t}`);
    } catch (error) {
      res.statusCode = 503;
      res.setHeader('content-type', 'text/plain');
      res.end(`ensureDatabase FAIL (${Date.now() - t}ms): ${error && (error.name + ' — ' + error.message)}`);
    }
    return;
  }

  try {
    await ensureDatabase();
  } catch (error) {
    console.error('[vercel] Database connection failed:', error.stack || error.message);
    res.statusCode = 503;
    res.end('ShopExpress is temporarily unavailable.');
    return;
  }
  return app(req, res);
};
