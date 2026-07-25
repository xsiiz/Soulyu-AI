module.exports = {
  apps: [
    {
      name: 'soulyu-server',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'soulyu-tunnel',
      script: 'npx',
      args: '-y cloudflared tunnel --url http://127.0.0.1:3000',
      autorestart: true,
      watch: false
    }
  ]
};
