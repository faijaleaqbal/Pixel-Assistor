const path = require('path');

module.exports = {
  apps: [
    {
      name: 'pixel-bot',
      script: 'index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_file: './.env',
      time: true,
    },
    {
      name: 'transcript-viewer',
      script: 'server.js',
      cwd: path.join(__dirname, 'transcript-viewer'),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '128M',
      env_file: path.join(__dirname, '.env'),
      time: true,
    },
  ],
};
