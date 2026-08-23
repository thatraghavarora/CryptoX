// Simple test handler for local debugging
import type { VercelApiHandler, VercelResponse } from '@vercel/node'

const handler: VercelApiHandler = async (req, res) => {
  console.log(`[TEST] ${req.method} ${req.url}`)
  
  // Webhook verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    console.log('Test webhook verification:', { mode, token, challenge })

    if (mode === 'subscribe' && token === '1') {
      console.log('✅ Webhook verified in test mode')
      res.status(200).send(challenge)
      return
    }

    res.status(200).json({
      status: 'ok',
      message: 'CryptoX WhatsApp Test Server',
      test_mode: true,
      chains_supported: ['hela', 'sepolia', 'mumbai', 'bsc_testnet', 'base_sepolia', 'arbitrum_sepolia', 'avalanche_fuji'],
    })
    return
  }

  // Handle incoming test messages
  if (req.method === 'POST') {
    console.log('Test POST received:', JSON.stringify(req.body, null, 2))
    
    // Simulate WhatsApp message
    const testResponse = {
      success: true,
      test_mode: true,
      message: '✅ WhatsApp bot is working!',
      chains: ['hela', 'sepolia', 'mumbai'],
      features: [
        'Multi-chain support',
        'Chain selection menu', 
        'Multi-chain balances',
        'Testnet transactions'
      ],
      next_steps: [
        'Deploy contracts: node scripts/deploy-multi-chain.js',
        'Update .env with contract addresses',
        'Expose locally: npx ngrok http 3000',
        'Set webhook URL in Meta Developer Console'
      ]
    }
    
    res.status(200).json(testResponse)
    return
  }

  res.status(405).json({ message: 'Method not allowed' })
}

export default handler