const { execSync } = require('child_process');

console.log('\n🚀 Starting Soulyu AI Server & Ngrok Permanent Tunnel with PM2...\n');

try {
  // 1. Start PM2 ecosystem
  execSync('npx -y pm2 start ecosystem.config.js', { stdio: 'inherit' });

  console.log('\n⏳ Connecting to your permanent Ngrok domain...\n');
  
  // Static domain assigned to user's free account
  const staticDomain = 'https://soulyuintelligent.xsiiz.space';

  console.log('\n================================================================');
  console.log('🎉 SOULYU AI SERVICES ARE LIVE IN BACKGROUND (PM2 DAEMON)');
  console.log('================================================================');
  console.log(`🏠 Local Workspace URL  : http://localhost:3000`);
  console.log(`🌐 Permanent Public Link : ${staticDomain}`);
  console.log('----------------------------------------------------------------');
  console.log('✨ This permanent link will NEVER change even on restart!');
  console.log('ℹ️  You can safely CLOSE this terminal now!');
  console.log('ℹ️  Useful commands:');
  console.log('   - Check status: npx pm2 status');
  console.log('   - View Public URL: curl -s http://127.0.0.1:4040/api/tunnels');
  console.log('   - Stop all: npx pm2 stop all');
  console.log('================================================================\n');

} catch (err) {
  console.error('❌ Error starting services:', err.message);
  process.exit(1);
}
