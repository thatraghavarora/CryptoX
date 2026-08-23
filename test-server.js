const http = require('http');
const { handler } = require('./api/whatsapp/index.ts' ? '' : './api/whatsapp/index.js');

// Create a simple test server
const server = http.createServer(async (req, res) => {
  console.log(`\n=== ${new Date().toISOString()} ===`);
  console.log(`${req.method} ${req.url}`);
  
  // Parse request body
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', async () => {
    try {
      // Convert to Vercel API format
      const vercelReq = {
        method: req.method,
        url: req.url,
        query: {},
        headers: req.headers,
        body: body ? JSON.parse(body) : {}
      };
      
      // Create Vercel response wrapper
      const vercelRes = {
        status: function(code) {
          res.statusCode = code;
          return this;
        },
        send: function(data) {
          res.end(data);
        },
        json: function(data) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        }
      };
      
      // Call the handler
      await handler(vercelReq, vercelRes);
      
    } catch (error) {
      console.error('Server error:', error);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`✅ WhatsApp webhook server running on http://localhost:${PORT}`);
  console.log(`📱 Test webhook URL: http://localhost:${PORT}/api/whatsapp`);
  console.log(`🔧 For Meta verification: http://localhost:${PORT}/api/whatsapp?hub.mode=subscribe&hub.verify_token=1&hub.challenge=test123`);
  console.log(`\n💡 Use ngrok or cloudflared to expose locally:`);
  console.log(`   npx ngrok http ${PORT}`);
  console.log(`   npx cloudflared tunnel --url http://localhost:${PORT}`);
});