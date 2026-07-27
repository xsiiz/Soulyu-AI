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
      args: '-y ngrok http 3000 --url=soulyuintelligent.xsiiz.space',
      autorestart: true,
      watch: false
    }
  ]
};
