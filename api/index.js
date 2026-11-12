'use strict';

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const OPTS = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 8000
};

module.exports = async (req, res) => {
  const trace = [];
  const t0 = Date.now();
  const step = (name, fn) => {
    try {
      const value = fn();
      trace.push(`${name}: OK`);
      return value;
    } catch (error) {
      trace.push(`${name}: FAIL — ${error && error.stack ? error.stack.split('\n')[0] : error}`);
      return null;
    }
  };

  step('MONGODB_URI set', () => {
    if (!MONGODB_URI) throw new Error('missing');
    trace.push('URI host: ' + (MONGODB_URI || '').split('@')[1]?.split('/')[0]);
    return true;
  });

  if (MONGODB_URI) {
    try {
      const timer = new Promise((resolve, reject) =>
        setTimeout(() => reject(new Error('connect timeout after 12s')), 12000)
      );
      await Promise.race([mongoose.connect(MONGODB_URI, OPTS), timer]);
      trace.push(`connected in ${Date.now() - t0}ms; readyState=${mongoose.connection.readyState}; host=${mongoose.connection.host}`);
      const count = await mongoose.connection.db.collection('products').countDocuments();
      trace.push(`products: ${count}`);
    } catch (error) {
      trace.push(`connect FAIL (${Date.now() - t0}ms): ${error && (error.name + ' — ' + error.message)}`);
    } finally {
      try {
        await mongoose.disconnect();
      } catch (disconnectError) {
        trace.push(`disconnect FAIL: ${disconnectError && disconnectError.message}`);
      }
    }
  }

  res.statusCode = 200;
  res.setHeader('content-type', 'text/plain');
  res.end(trace.join('\n'));
};
