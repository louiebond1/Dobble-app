'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { resolveDataDir } = require('../lib/data-dir');

test('persistent data goes to the volume on Fly and Railway, never the app folder', () => {
  assert.strictEqual(resolveDataDir({ DATA_DIR: '/vol' }), '/vol');
  assert.strictEqual(resolveDataDir({ FLY_APP_NAME: 'dobble-app-louie' }), '/data');
  assert.strictEqual(resolveDataDir({ RAILWAY_VOLUME_MOUNT_PATH: '/mnt/v' }), '/mnt/v');
  assert.strictEqual(resolveDataDir({ RAILWAY_ENVIRONMENT_ID: 'x' }), '/data');
  assert.strictEqual(resolveDataDir({}), path.join(__dirname, '..', 'data'));
});
