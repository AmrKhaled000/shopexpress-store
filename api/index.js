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
      const shop = require('../controllers/shop');
      await new Promise((resolve, reject) => {
        const fakeReq = { query: {}, params: {}, user: null, sessionID: 'debug', session: {}, flash: () => [], body: {}, cookies: {}, headers: {} };
        const fakeRes = {
          render: (view, locals, cb) => {
            res.setHeader('content-type', 'text/plain');
            if (locals && locals.prods) return res.end('render ok: prods=' + locals.prods.length + ', first=' + (locals.prods[0] && locals.prods[0].title));
            return res.end('render called without prods: ' + JSON.stringify(Object.keys(locals || {})));
          },
          setHeader: () => {},
          set: () => {},
          status: () => fakeRes,
          redirect: (url) => { res.setHeader('content-type', 'text/plain'); res.end('redirect: ' + url); },
          send: (b) => { res.end(String(b).slice(0, 1500)); },
          end: (b) => { res.end(String(b).slice(0, 1500)); }
        };
        fakeRes.next = reject;
        shop.getIndex(fakeReq, fakeRes, reject);
      });
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
