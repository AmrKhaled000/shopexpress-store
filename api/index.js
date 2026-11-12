'use strict';

/**
 * Vercel serverless entry point.
 *
 * vercel.json routes all non-file requests to this function. Static files in
 * `public/` are served by Vercel's CDN (filesystem takes precedence over the
 * rewrite), so only application requests hit this handler.
 *
 * Mongoose connections do not survive Vercel's freeze/thaw cycle — a cached
 * connection looks alive (readyState 1) but its sockets are dead and every
 * operation buffers until timeout. The safe pattern is a fresh connection
 * per invocation.
 */

const mongoose = require('mongoose');
const app = require('../app');

const MONGODB_URI = process.env.MONGODB_URI;
const MONGOOSE_OPTIONS = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 15000
};

module.exports = async (req, res) => {
  if (!MONGODB_URI) {
    console.error('[vercel] MONGODB_URI is not set');
    res.statusCode = 503;
    res.end('ShopExpress is temporarily unavailable.');
    return;
  }

  if (String(req.url || '').startsWith('/_error-debug')) {
    try {
      await mongoose.connect(MONGODB_URI, MONGOOSE_OPTIONS);
      const Product = require('../models/product');
      const t0 = Date.now();
      const db = mongoose.connection.db;
      const raw = await db.collection('products').countDocuments();
      const trace = ['raw count=' + raw + ' ms=' + (Date.now() - t0)];
      try {
        const docs = await mongoose.connection.db.collection('products').find({}).limit(2).toArray();
        trace.push('raw find ok docs=' + docs.length);
      } catch (e) {
        trace.push('raw find FAIL: ' + (e && e.message));
      }
      try {
        const qr = Date.now();
        const count = await Product.countDocuments();
        trace.push('model count=' + count + ' ms=' + (Date.now() - qr));
      } catch (e) {
        trace.push('model count FAIL: ' + (e && e.message));
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'text/plain');
      res.end(trace.join('\n'));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('content-type', 'text/plain');
      res.end('debug caught: ' + (error && (error.stack || error.message)));
    }
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI, MONGOOSE_OPTIONS);
  } catch (error) {
    console.error('[vercel] Database connection failed:', error.stack || error.message);
    res.statusCode = 503;
    res.end('ShopExpress is temporarily unavailable.');
    return;
  }
  return app(req, res);
};
