'use strict';

/**
 * Small in-process runner. `node --test` spawns a child process per file,
 * which is not available in every restricted environment; requiring the test
 * files directly runs the same node:test assertions without spawning.
 */
require('./catalog.test.js');
require('./format.test.js');
