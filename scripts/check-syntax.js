'use strict';

/**
 * Dependency-free syntax check for every server, client, and view file.
 * Runs `node --check`-equivalent parsing in-process so it works in restricted
 * environments too.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..');
const JS_ROOTS = [
  'app.js',
  'controllers',
  'middleware',
  'models',
  'routes',
  'util',
  'scripts',
  'tests',
  'public/js'
];

function walk(target, extension, files) {
  const full = path.join(ROOT, target);
  if (!fs.existsSync(full)) {
    return files;
  }
  const stat = fs.statSync(full);
  if (stat.isFile()) {
    if (full.endsWith(extension)) {
      files.push(full);
    }
    return files;
  }
  for (const entry of fs.readdirSync(full)) {
    walk(path.join(target, entry), extension, files);
  }
  return files;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

const jsFiles = JS_ROOTS.flatMap(root => walk(root, '.js', []));
const viewFiles = walk('views', '.ejs', []);
const errors = [];

for (const file of jsFiles) {
  if (/\.artifacts[\\/]/.test(file)) {
    continue;
  }
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: relative(file) });
  } catch (error) {
    errors.push(`${relative(file)}: ${error.message}`);
  }
}

for (const file of viewFiles) {
  try {
    ejs.compile(fs.readFileSync(file, 'utf8'), { filename: file });
  } catch (error) {
    errors.push(`${relative(file)}: ${error.message}`);
  }
}

if (errors.length > 0) {
  console.error(`Syntax check failed with ${errors.length} error(s):`);
  for (const error of errors) {
    console.error('  ✖ ' + error);
  }
  process.exit(1);
}

console.log(`Syntax check passed: ${jsFiles.length} JavaScript files, ${viewFiles.length} EJS views.`);
