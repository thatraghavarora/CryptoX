const http = require('http');
const url = require('url');
require('dotenv').config();

// Check environment variables
console.log('🔧 Checking environment...');
console.log('META_WA_ACCESS_TOKEN:', process.env.META_WA_ACCESS_TOKEN ? '✅ Present' : '❌ Missing');
console.log('META_WA_SENDER_PHONE_NUMBER_ID:', process.env.META_WA_SENDER_PHONE_NUMBER_ID ? '✅ Present' : '❌ Missing');
console.log('META_WA_VERIFY_TOKEN:', process.env.META_WA_VERIFY_TOKEN ? '✅ Present' : '❌ Missing');
console.log('WA_BUSSINESS_PHONE_NUMBER:', process.env.WA_BUSSINESS_PHONE_NUMBER ? '✅ Present' : '❌ Missing');
console.log('');

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  console.log(`\n📡 ${req.method} ${req.url}`);
  
  // Handle webhook verification
  if (req.method === 'GET' && parsedUrl.pathname === '/api/whatsapp') {
    const mode = parsedUrl.query['hub.mode'];
    const token = parsedUrl.query['hub.verify_token'];
    const challenge = parsedUrl.query['hub.challenge'];
    
    console.log('Webhook verification:', { mode, token, challenge });
    
    if (mode === 'subscribe' && token === process.env.META_WA_VERIFY_TOKEN) {
      console.log('✅ Webhook verified successfully');
      res.writeHead(200);
      res.end(challenge);
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      message: 'CryptoX WhatsApp Bot',
      chains: ['hela', 'sepolia', 'mumbai', 'bsc_testnet', 'base_sepolia', 'arbitrum_sepolia', 'avalanche_fuji'],
      url: 'http://localhost:3000/api/whatsapp',
      verify_token: process.env.META_WA_VERIFY_TOKEN
    }));
    return;
  }
  
  // Handle incoming messages
  if (req.method === 'POST' && parsedUrl.pathname === '/api/whatsapp') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('📱 Incoming message:', JSON.stringify(data, null, 2));
        
        // Try to send response
        sendTestResponse();
      } catch (err) {
        console.log('Error parsing body:', err);
      }
      
      // Always return 200 to WhatsApp
      res.writeHead(200);
      res.end('ok');
    });
    return;
  }
  
  // Default response
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('CryptoX WhatsApp Bot Server\nUse /api/whatsapp for webhook');
});

async function sendTestResponse() {
  console.log('\n🤖 Attempting to send test response...');
  
  try {
    // Check if whatsapp library works
    const whatsapp = require('./lib/whatsapp');
    console.log('✅ WhatsApp library loaded');
    
    // Send test message
    const testPhone = process.env.WA_BUSSINESS_PHONE_NUMBER || '918949321383';
    console.log('📲 Sending to:', testPhone);
    
    await whatsapp.sendMessageToPhoneNumber(
      testPhone,
      '✅ CryptoX Bot is working!\n\n' +
      'Multi-chain support enabled:\n' +
      '• Hela Chain (HLUSD)\n' +
      '• Ethereum Sepolia (ETH)\n' +
      '• Polygon Mumbai (MATIC)\n' +
      '• BSC Testnet (BNB)\n' +
      '• Base Sepolia (ETH)\n' +
      '• Arbitrum Sepolia (ETH)\n' +
      '• Avalanche Fuji (AVAX)\n\n' +
      'Try: Create Wallet, Check Balance, Send Money'
    );
    
    console.log('✅ Test message sent successfully!');
  } catch (error) {
    console.log('❌ Error sending message:', error.message);
    console.log('💡 Solution:');
    console.log('1. Check WhatsApp API tokens');
    console.log('2. Ensure phone number has permission');
    console.log('3. Verify webhook is set correctly');
  }
}

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 CryptoX WhatsApp Bot Server Started`);
  console.log(`📡 http://localhost:${PORT}`);
  console.log(`🔗 Webhook: http://localhost:${PORT}/api/whatsapp`);
  console.log(`🔑 Verify Token: ${process.env.META_WA_VERIFY_TOKEN || '1'}`);
  console.log('\n📱 To test:');
  console.log('1. Send WhatsApp message to bot');
  console.log('2. Or use: curl -X POST http://localhost:3000/api/whatsapp');
  console.log('\n🌐 To expose to internet:');
  console.log('npx ngrok http 3000');
});