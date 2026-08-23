import type { VercelApiHandler, VercelResponse } from '@vercel/node'
import { WhatsappNewMessageEventNotificationRequest, WhatsappParsedMessage } from './types'
import {
  Whatsapp,
  sendMessageToPhoneNumber,
  sendSimpleButtonsMessage,
} from '../../lib/whatsapp'
import {
  getUserFromPhoneNumber,
  createUser,
  getUserPrimaryChain,
} from '../../lib/user'
import { 
  getMultiChainBalances,
  getSupportedChains,
  getChainInfo,
  setUserPin,
  verifyUserPin,
  checkIsPinSet,
} from '../../lib/crypto'
import {
  makePaymentRequest,
  addReceiverToPayment,
  confirmPaymentRequest,
  sendCryptoFromWallet,
  getExplorerUrlForAddress,
  isReceiverInputPending,
  isUserAwaitingAmountInput,
  isUserAwaitingPin,
  cancelPaymentRequest,
  getAmountFromPendingRequest,
  getRecipientAddressFromUncompletedPaymentRequest,
  getReceiverUserFromUncompletedPaymentRequest,
  confirmPinAndFinalize,
  updatePaymentRequestToError,
} from '../../lib/crypto/transaction'
import { transformStringToNumber } from '../../lib/utils/number'

const seenMessageIds = new Set<string>()

// State management
const walletCreationPending = new Map<string, { name: string }>()
const chainSelectionPending = new Map<string, boolean>()

// Helper functions
async function send(phone: string, _name: string, text: string): Promise<void> {
  try {
    await sendMessageToPhoneNumber(phone, text)
  } catch (err) {
    console.error(`Failed to send message to ${phone}:`, err)
  }
}

async function sendButtons(
  phone: string,
  _name: string,
  text: string,
  buttons: { title: string; id: string }[],
): Promise<void> {
  try {
    await sendSimpleButtonsMessage(phone, text, buttons)
  } catch (err) {
    console.error(`Failed to send buttons to ${phone}:`, err)
  }
}

// Menu functions
async function sendMenuTo(phone: string, name: string): Promise<void> {
  const userChain = getUserPrimaryChain(phone) || 'hela'
  const chainInfo = getChainInfo(userChain)
  
  await sendButtons(phone, name, `Select action (${chainInfo.name}):`, [
    { title: '🌐 Change Network', id: 'change_network' },
    { title: '💰 Check Balance', id: 'check_balance' },
    { title: '💸 Send Money', id: 'send_money' },
    { title: '📥 Deposit', id: 'check_address' },
  ])
}

async function sendChainSelectionMenu(phone: string, name: string): Promise<void> {
  const supportedChains = getSupportedChains()
  const buttons = supportedChains.map(chainName => {
    const chainInfo = getChainInfo(chainName)
    return {
      title: `${chainInfo.name} (${chainInfo.nativeCurrency})`,
      id: `select_chain_${chainName}`,
    }
  })
  
  await sendButtons(
    phone,
    name,
    'Select blockchain network (TESTNET only):',
    buttons
  )
}

async function showMultiChainBalance(phone: string, name: string, privateKey: string): Promise<void> {
  try {
    const balances = await getMultiChainBalances(privateKey)
    const userChain = getUserPrimaryChain(phone)
    
    let balanceMessage = '💰 Your Balances:\n\n'
    
    for (const [chainName, balanceInfo] of Object.entries(balances)) {
      const chainInfo = getChainInfo(chainName)
      const isPrimary = chainName === userChain
      const primaryIndicator = isPrimary ? '⭐ ' : '  '
      
      balanceMessage += `${primaryIndicator}${chainInfo.name}:\n`
      balanceMessage += `   ${balanceInfo.balance.toFixed(6)} ${balanceInfo.currency}\n\n`
    }
    
    if (userChain) {
      const chainInfo = getChainInfo(userChain)
      balanceMessage += `Primary network: ${chainInfo.name}\n`
      balanceMessage += `Explorer: ${chainInfo.explorerUrl}`
    }
    
    await send(phone, name, balanceMessage)
  } catch (error) {
    await send(phone, name, '❌ Failed to fetch balances. Please try again.')
  }
}

// Main handler
const handler: VercelApiHandler = async (
  req: WhatsappNewMessageEventNotificationRequest,
  res: VercelResponse,
) => {
  console.log(`[INCOMING REQUEST] ${req.method} ${req.url}`)
  
  // Webhook verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    console.log('Webhook verification:', { mode, token, challenge })

    if (mode === 'subscribe') {
      console.log('Webhook verified successfully')
      res.status(200).send(challenge)
      return
    }

    res.status(200).json({
      status: 'ok',
      service: 'CryptoX WhatsApp Webhook',
      message: 'Webhook is active.',
    })
    return
  }

  // Handle incoming messages
  if (req.method === 'POST') {
    console.log('POST /api/whatsapp — raw body:', JSON.stringify(req.body, null, 2))

    let recipientPhone = 'unknown'
    let recipientName = 'Unknown'

    try {
      const data: WhatsappParsedMessage = Whatsapp.parseMessage(req.body)

      if (!data?.isMessage) {
        console.log('Non-message webhook event received')
        res.status(200).send('ok')
        return
      }

      const { message } = data
      let messageId = message.message_id
      
      // Deduplicate
      if (seenMessageIds.has(messageId)) {
        console.log(`Duplicate message ${messageId} ignored`)
        res.status(200).send('ok')
        return
      }
      seenMessageIds.add(messageId)
      if (seenMessageIds.size > 1000) seenMessageIds.clear()

      recipientPhone = message.from.phone
      recipientName = message.from.name || 'Unknown'
      const typeOfMessage = message.type
      const text = message.text

      console.log(`Message from ${recipientPhone} (${recipientName}) — type: ${typeOfMessage}`)

      // TEXT MESSAGE HANDLING
      if (typeOfMessage === 'text_message' && text) {
        const messageText = text.body.trim()
        
        // 1. Handle chain selection
        if (chainSelectionPending.has(recipientPhone)) {
          chainSelectionPending.delete(recipientPhone)
          const selectedChain = getSupportedChains().find(chain => 
            chain.toLowerCase() === messageText.toLowerCase()
          )
          
          if (selectedChain) {
            const chainInfo = getChainInfo(selectedChain)
            await send(
              recipientPhone,
              recipientName,
              `✅ Selected ${chainInfo.name} network\nCurrency: ${chainInfo.nativeCurrency}`
            )
            await sendMenuTo(recipientPhone, recipientName)
          } else {
            await send(
              recipientPhone,
              recipientName,
              '❌ Invalid network selection. Use the button menu.'
            )
            await sendChainSelectionMenu(recipientPhone, recipientName)
          }
          res.status(200).send('ok')
          return
        }

        // 2. Handle wallet creation PIN
        if (walletCreationPending.has(recipientPhone)) {
          const pin = messageText
          if (!/^\d{4,6}$/.test(pin)) {
            await send(
              recipientPhone,
              recipientName,
              '❌ Invalid PIN. Please reply with a 4-6 digit number.'
            )
            res.status(200).send('ok')
            return
          }

          const pendingData = walletCreationPending.get(recipientPhone)!
          try {
            await send(recipientPhone, recipientName, '⏳ Creating your wallet...')
            
            // Create user on default chain (hela)
            const { address } = await createUser(recipientPhone, pendingData.name, 'hela')
            await setUserPin(recipientPhone, pin)
            
            walletCreationPending.delete(recipientPhone)
            
            await send(
              recipientPhone,
              recipientName,
              `✅ Wallet created!\n\nYour address:\n${address}\n\nPIN set successfully.`
            )
            await sendMenuTo(recipientPhone, recipientName)
          } catch (err) {
            walletCreationPending.delete(recipientPhone)
            await send(
              recipientPhone,
              recipientName,
              `❌ Failed to create wallet: ${(err as Error).message}`
            )
          }
          res.status(200).send('ok')
          return
        }

        // 3. Check if user exists (with timeout to avoid hanging)
        let user = null
        try {
          user = await Promise.race([
            getUserFromPhoneNumber(recipientPhone),
            new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('Blockchain lookup timed out after 8s')), 8000),
            ),
          ])
        } catch (blockchainErr) {
          const errMsg = (blockchainErr as Error).message
          console.error('Blockchain lookup failed:', errMsg)
          // On timeout/error, fall through to show welcome — user can always retry
          user = null
        }
        
        if (user) {
          const userId = user.address
          
          // Handle payment flows
          if (await isReceiverInputPending(userId)) {
            try {
              const validatedReceiver = await addReceiverToPayment({
                userId,
                receiver: messageText,
              })
              await send(
                recipientPhone,
                recipientName,
                `How much to send to ${validatedReceiver}?`
              )
            } catch (err) {
              await send(
                recipientPhone,
                recipientName,
                `❌ Invalid recipient: ${(err as Error).message}`
              )
            }
            res.status(200).send('ok')
            return
          }

          if (await isUserAwaitingAmountInput(userId)) {
            try {
              const amount = transformStringToNumber(messageText)
              await confirmPaymentRequest({ userId, amount })
              
              const pinSet = await checkIsPinSet(recipientPhone)
              if (!pinSet) {
                await updatePaymentRequestToError(userId)
                await send(
                  recipientPhone,
                  recipientName,
                  '🔐 You need to set a PIN first. Please recreate your wallet.'
                )
                await sendMenuTo(recipientPhone, recipientName)
              } else {
                await send(
                  recipientPhone,
                  recipientName,
                  `🔐 Enter your PIN to confirm sending ${amount}:`
                )
              }
            } catch (err) {
              await send(
                recipientPhone,
                recipientName,
                `❌ Invalid amount: ${(err as Error).message}`
              )
            }
            res.status(200).send('ok')
            return
          }

          if (await isUserAwaitingPin(userId)) {
            const pinValid = await verifyUserPin(recipientPhone, messageText)
            if (!pinValid) {
              await send(
                recipientPhone,
                recipientName,
                '❌ Wrong PIN. Please try again.'
              )
              res.status(200).send('ok')
              return
            }

            try {
              await confirmPinAndFinalize(userId)
              const privateKey = user.privateKey
              const toAddress = await getRecipientAddressFromUncompletedPaymentRequest(userId)
              const amount = getAmountFromPendingRequest(userId)
              
              const userChain = getUserPrimaryChain(recipientPhone) || 'hela'
              await sendCryptoFromWallet({
                tokenAmount: amount,
                toAddress,
                privateKey,
                chain: userChain,
              })
              
              await send(
                recipientPhone,
                recipientName,
                `✅ Payment of ${amount} sent successfully!`
              )
              
              // Notify receiver if they're a user
              const receiverUser = await getReceiverUserFromUncompletedPaymentRequest(userId)
              if (receiverUser) {
                await send(
                  receiverUser.phoneNumer,
                  receiverUser.name,
                  `💰 You received ${amount} from ${recipientName}!`
                )
              }
              
              await sendMenuTo(recipientPhone, recipientName)
            } catch (err) {
              await send(
                recipientPhone,
                recipientName,
                `❌ Payment failed: ${(err as Error).message}`
              )
            }
            res.status(200).send('ok')
            return
          }

          // Existing user — show menu regardless of what they typed
          await send(recipientPhone, recipientName, `Welcome back${recipientName ? `, ${recipientName}` : ''}! 👋`)
          await sendMenuTo(recipientPhone, recipientName)
        } else {
          // New user (or blockchain unavailable) — show welcome flow
          await send(
            recipientPhone,
            recipientName,
            `Hi ${recipientName}! 👋 Welcome to *CryptoX*`
          )
          await send(
            recipientPhone,
            recipientName,
            `CryptoX is a WhatsApp-native crypto wallet ⛓️\n\n✅ Instant payments\n✅ Send & receive crypto\n✅ Non-custodial wallet\n✅ No app needed — just WhatsApp!`
          )
          await sendButtons(
            recipientPhone,
            recipientName,
            "You don't have a wallet yet. Would you like to create one?",
            [{ title: 'Create Wallet', id: 'create_wallet' }]
          )
        }
        
        res.status(200).send('ok')
        return
      }

      // BUTTON REPLY HANDLING
      if (typeOfMessage === 'simple_button_message') {
        const button_id = data.message.button_reply?.id
        console.log('Button pressed:', button_id)

        let user = null
        try {
          user = await Promise.race([
            getUserFromPhoneNumber(recipientPhone),
            new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('Blockchain lookup timed out')), 8000),
            ),
          ])
        } catch (blockchainErr) {
          console.error('Blockchain lookup failed (button):', (blockchainErr as Error).message)
          user = null
        }

        try {
          switch (button_id) {
            case 'change_network':
              chainSelectionPending.set(recipientPhone, true)
              await sendChainSelectionMenu(recipientPhone, recipientName)
              break

            case 'check_balance':
              if (!user) {
                await send(recipientPhone, recipientName, '❌ Please create a wallet first.')
                await sendButtons(
                  recipientPhone,
                  recipientName,
                  "Create a wallet?",
                  [{ title: 'Create Wallet', id: 'create_wallet' }]
                )
                break
              }
              await showMultiChainBalance(recipientPhone, recipientName, user.privateKey)
              await sendMenuTo(recipientPhone, recipientName)
              break

            case 'send_money':
              if (!user) {
                await send(recipientPhone, recipientName, '❌ Please create a wallet first.')
                break
              }
              const userChain = getUserPrimaryChain(recipientPhone) || 'hela'
              const chainInfo = getChainInfo(userChain)
              await makePaymentRequest({
                fromUserId: user.address,
                to: null,
                amount: null,
                chain: userChain,
              })
              await send(
                recipientPhone,
                recipientName,
                `💸 Send ${chainInfo.nativeCurrency}\n\nEnter recipient's phone number or wallet address:`
              )
              break

            case 'check_address':
              if (!user) {
                await send(recipientPhone, recipientName, '❌ Please create a wallet first.')
                break
              }
              const userChain2 = getUserPrimaryChain(recipientPhone) || 'hela'
              const explorerUrl = getExplorerUrlForAddress(user.address, userChain2)
              await send(
                recipientPhone,
                recipientName,
                `📥 Your wallet address:\n${user.address}\n\n🔗 View on explorer:\n${explorerUrl}`
              )
              await sendMenuTo(recipientPhone, recipientName)
              break

            case 'create_wallet':
              walletCreationPending.set(recipientPhone, { name: recipientName })
              await send(
                recipientPhone,
                recipientName,
                '🔐 Set a 4-6 digit PIN for your wallet:'
              )
              break

            default:
              // Handle chain selection buttons
              if (button_id?.startsWith('select_chain_')) {
                const chainName = button_id.replace('select_chain_', '')
                if (getSupportedChains().includes(chainName)) {
                  const chainInfo = getChainInfo(chainName)
                  await send(
                    recipientPhone,
                    recipientName,
                    `✅ Network changed to ${chainInfo.name}`
                  )
                  // Note: In production, you'd store this preference
                  await sendMenuTo(recipientPhone, recipientName)
                }
                break
              }
              
              await sendMenuTo(recipientPhone, recipientName)
          }
        } catch (err) {
          console.error('Button handler error:', err)
          await send(
            recipientPhone,
            recipientName,
            `❌ Error: ${(err as Error).message}`
          )
        }

        res.status(200).send('ok')
        return
      }

      // Default response
      res.status(200).send('ok')
      
    } catch (error) {
      console.error('Handler error:', error)
      res.status(200).send('ok') // Always return 200 to WhatsApp
    }
    return
  }

  res.status(405).json({ message: 'Method not allowed' })
}

export default handler