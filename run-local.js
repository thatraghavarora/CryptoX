/**
 * run-local.js
 * 
 * Local development server that uses the REAL api/whatsapp/index.ts handler.
 * Run with: node run-local.js
 * Expose with: npx ngrok http 3000
 */

require('dotenv').config()

// Register tsx so we can require TypeScript files
require('tsx/cjs')

const express = require('express')
const app = express()
app.use(express.json())

console.log('🔧 Checking environment...')
console.log('META_WA_ACCESS_TOKEN:', process.env.META_WA_ACCESS_TOKEN ? '✅ Present' : '❌ Missing')
console.log('META_WA_SENDER_PHONE_NUMBER_ID:', process.env.META_WA_SENDER_PHONE_NUMBER_ID ? '✅ Present' : '❌ Missing')
console.log('HELA_CONTRACT_ADDRESS:', process.env.HELA_CONTRACT_ADDRESS ? '✅ ' + process.env.HELA_CONTRACT_ADDRESS : '❌ Missing')
console.log('OPERATOR_PRIVATE_KEY:', process.env.OPERATOR_PRIVATE_KEY ? '✅ Present' : '❌ Missing')
console.log('SUPPORTED_CHAINS:', process.env.SUPPORTED_CHAINS)
console.log('')

// Load the real handler
let handler
try {
  const mod = require('./api/whatsapp/index.ts')
  handler = mod.default || mod
  console.log('✅ Real WhatsApp handler loaded from api/whatsapp/index.ts')
} catch (err) {
  console.error('❌ Failed to load handler:', err.message)
  console.error(err.stack)
  process.exit(1)
}

// Wrap handler: Vercel's VercelApiHandler takes (req, res) — same as Express
app.all('/api/whatsapp', async (req, res) => {
  console.log(`\n📡 ${req.method} ${req.url}`)
  try {
    await handler(req, res)
  } catch (err) {
    console.error('Handler threw uncaught error:', err)
    if (!res.headersSent) {
      res.status(200).send('ok') // Always 200 to WhatsApp
    }
  }
})

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CryptoX WhatsApp Bot (Local Dev)',
    webhook: '/api/whatsapp',
    chains: process.env.SUPPORTED_CHAINS,
  })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 CryptoX Local Dev Server Started`)
  console.log(`📡 http://localhost:${PORT}`)
  console.log(`🔗 Webhook: http://localhost:${PORT}/api/whatsapp`)
  console.log(`🔑 Verify Token: ${process.env.META_WA_VERIFY_TOKEN || '1'}`)
  console.log('')
  console.log('📱 To expose to internet:')
  console.log('   npx ngrok http 3000')
  console.log('   Then set webhook in Meta Developer Console to:')
  console.log('   https://YOUR_NGROK_URL/api/whatsapp')
})