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
      const products = await Product.find().sort({ _id: -1 }).limit(2).exec();
      const count = await Product.countDocuments();
      res.statusCode = 200;
      res.setHeader('content-type', 'text/plain');
      res.end(`debug ok: count=${count}, first=${products[0] ? products[0].title : 'none'}`);
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
