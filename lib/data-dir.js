'use strict';
// Where everything that must survive a redeploy is written: lifetime stats, leaderboards,
// saved party matches and Draft Night. On a host with a persistent volume this must be the
// volume, never the app folder (the app folder is replaced on every deploy).
//   DATA_DIR                  explicit choice (set this on Fly: /data)
//   RAILWAY_VOLUME_MOUNT_PATH Railway volume
//   /data                     on Fly (FLY_APP_NAME is set) or Railway, the conventional mount
//   ./data                    local development
const path = require('path');

function resolveDataDir(env = process.env) {
  if (env.DATA_DIR) return env.DATA_DIR;
  if (env.RAILWAY_VOLUME_MOUNT_PATH) return env.RAILWAY_VOLUME_MOUNT_PATH;
  if (env.FLY_APP_NAME || env.RAILWAY_ENVIRONMENT_ID) return '/data';
  return path.join(__dirname, '..', 'data');
}

module.exports = { DATA_DIR: resolveDataDir(), resolveDataDir };
