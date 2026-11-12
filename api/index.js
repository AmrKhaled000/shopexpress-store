'use strict';

// Diagnostic bisect: report each import step so we can see exactly what crashes on Vercel.
const report = [];
const step = (name, fn) => {
  try {
    const value = fn();
    report.push(`${name}: OK`);
    return value;
  } catch (error) {
    report.push(`${name}: FAIL — ${error && error.stack ? error.stack.split('\n')[0] : error}`);
    return null;
  }
};

const mongoose = step('mongoose require', () => require('mongoose'));
const sessionLib = step('connect-mongodb-session require', () => require('connect-mongodb-session'));
const csrf = step('csurf require', () => require('csurf'));
const bcryptjs = step('bcryptjs require', () => require('bcryptjs'));
const ejs = step('ejs require', () => require('ejs'));
const mailer = step('util/mailer require', () => require('../util/mailer'));
const userModel = step('models/user require', () => require('../models/user'));
const productModel = step('models/product require', () => require('../models/product'));
const orderModel = step('models/order require', () => require('../models/order'));
const app = step('app require', () => require('../app'));

module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader('content-type', 'text/plain');
  res.end(report.join('\n'));
};
