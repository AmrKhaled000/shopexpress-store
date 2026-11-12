'use strict';

// Minimal bisect test: no shop requires at all, just process version.
module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ version: process.version, uptime: process.uptime() }));
};
