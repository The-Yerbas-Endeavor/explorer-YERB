'use strict';

module.exports = {
  apps: [
    {
      name: 'explorer-assets-test',
      script: './bin/instance',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      node_args: '--stack-size=10000',
      autorestart: true,
      max_memory_restart: '1G',
      env: {NODE_ENV: 'production'}
    },
    {
      name: 'explorer-assets-indexer',
      script: './scripts/sync-assets.js',
      args: 'update',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      cron_restart: '*/5 * * * *',
      kill_timeout: 30000,
      env: {NODE_ENV: 'production', ASSET_SYNC_CONCURRENCY: '4'}
    }
  ]
};
