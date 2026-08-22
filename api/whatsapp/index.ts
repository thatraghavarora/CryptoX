import type { VercelApiHandler, VercelResponse } from '@vercel/node'
import { WhatsappNewMessageEventNotificationRequest, WhatsappParsedMessage } from './types'
import {
  Whatsapp,
  sendMessageToPhoneNumber,
  sendSimpleButtonsMessage,
  sendImageToPhoneNumber,
} from '../../lib/whatsapp'
import {
  getAddressByPhoneNumber,
  getPrivateKeyByPhoneNumber,
  getUserFromPhoneNumber,
  createUser,
} from '../../lib/user'
import { getAccountBalances, setUserPin, verifyUserPin, checkIsPinSet } from '../../lib/crypto'
import {
  addReceiverToPayment,
  cancelPaymentRequest,
  confirmPaymentRequest,
  confirmPinAndFinalize,
  getAmountFromPendingRequest,
  getHelaScanUrlForAddress,
  getReceiverUserFromUncompletedPaymentRequest,
  getRecipientAddressFromUncompletedPaymentRequest,
  isReceiverInputPending,
  isUserAwaitingAmountInput,
  isUserAwaitingPin,
  makePaymentRequest,
  sendHlusdFromWallet,
  updatePaymentRequestToError,
} from '../../lib/crypto/transaction'
import { transformStringToNumber } from '../../lib/utils/number'
import { messageLog, logIncoming, logOutgoing, logSystem } from '../../lib/message-log'

const seenMessageIds = new Set<string>()

// ─── Wallet Creation State ────────────────────────────────────────────────────
// Tracks users who clicked "Create Wallet" and need to provide a PIN first.
// Maps phone → { name } so we can create wallet after PIN is collected.
const walletCreationPending = new Map<string, { name: string }>()

// ─── Helper: send a message and log delivery status ───────────────────────────
async function send(phone: string, name: string, text: string): Promise<void> {
  const log = logOutgoing({ phone, name, text, type: 'text_message' })
  try {
    await sendMessageToPhoneNumber(phone, text)
    log.markDelivered()
  } catch (err) {
    log.markFailed((err as Error).message || String(err))
    throw err
  }
}

async function sendButtons(
  phone: string,
  name: string,
  text: string,
  buttons: { title: string; id: string }[],
): Promise<void> {
  const log = logOutgoing({ phone, name, text, type: 'button_message' })
  try {
    await sendSimpleButtonsMessage(phone, text, buttons)
    log.markDelivered()
  } catch (err) {
    log.markFailed((err as Error).message || String(err))
    throw err
  }
}

// ─── Send the main menu buttons ───────────────────────────────────────────────
async function sendMenuTo(phone: string, name: string): Promise<void> {
  await sendButtons(phone, name, 'What would you like to do?', [
    { title: 'Deposit funds', id: 'check_address' },
    { title: 'Send money 💸', id: 'send_money' },
    { title: 'Check balance 🔎', id: 'check_balance' },
  ])
}

// ─── Main handler ─────────────────────────────────────────────────────────────
const handler: VercelApiHandler = async (
  req: WhatsappNewMessageEventNotificationRequest,
  res: VercelResponse,
) => {
  console.log(`[INCOMING REQUEST] ${req.method} ${req.url}`)
  // ── GET: Expose logs for debug page ───────────────────────────────────────
  if (req.method === 'GET' && req.query.action === 'logs') {
    res.status(200).json({ ok: true, logs: messageLog })
    return
  }

  if (req.method === 'GET' && req.query.action === 'clear') {
    messageLog.splice(0, messageLog.length)
    res.status(200).json({ ok: true, message: 'Logs cleared' })
    return
  }

  // ── GET: Webhook verification ──────────────────────────────────────────────
  if (req.method === 'GET') {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    console.log('GET /api/whatsapp', { mode, token, challenge })

    if (mode === 'subscribe') {
      console.log(`Webhook verification attempt. Expected: "${process.env.META_WA_VERIFY_TOKEN}", Got: "${token}"`)
      logSystem(`Webhook verified by Meta (Bypass Check)`)
      // Send challenge back immediately to verify
      res.status(200).send(challenge)
      return
    }

    // Plain GET (health check / browser visit) — return friendly status
    res.status(200).json({
      status: 'ok',
      service: 'CryptoX WhatsApp Webhook',
      message: 'Webhook is active. Awaiting Meta verification with hub.mode=subscribe.',
      timestamp: new Date().toISOString(),
    })
    return
  }


  // ── POST: Incoming WhatsApp message ──────────────────────────────────────────
  if (req.method === 'POST') {
    console.log('POST /api/whatsapp — raw body:', JSON.stringify(req.body, null, 2))

    let recipientPhone = 'unknown'
    let recipientName = 'Unknown'

    try {
      const data: WhatsappParsedMessage = Whatsapp.parseMessage(req.body)

      if (!data?.isMessage) {
        logSystem('Non-message webhook event received (status update / read receipt etc.)')
        res.status(200).send('ok')
        return
      }

      const { message } = data
      let messageId = message.message_id
      
      // ── Deduplicate: Meta retries if our blockchain calls take > 5s ──────
      if (seenMessageIds.has(messageId)) {
        console.log(`Duplicate message ${messageId} ignored to prevent spam.`)
        res.status(200).send('ok')
        return
      }
      seenMessageIds.add(messageId)
      // Keep set from growing infinitely
      if (seenMessageIds.size > 1000) seenMessageIds.clear()

      recipientPhone = message.from.phone
      recipientName = message.from.name || 'Unknown'
      messageId = message.message_id
      const typeOfMessage = message.type
      const text = message.text

      // ── Log the incoming message ─────────────────────────────────────────
      logIncoming({
        phone: recipientPhone,
        name: recipientName,
        text: text?.body || `[${typeOfMessage}]`,
        type: typeOfMessage,
        messageId,
      })

      console.log(`Message from ${recipientPhone} (${recipientName}) — type: ${typeOfMessage}`)

      // ── Block Brazil numbers ─────────────────────────────────────────────
      if (recipientPhone.startsWith('55')) {
        if (process.env.ADMIN_PHONE_NUMBER && process.env.BRAZIL_MESSAGE) {
          await send(recipientPhone, recipientName, process.env.BRAZIL_MESSAGE)
          await send(
            process.env.ADMIN_PHONE_NUMBER,
            'Admin',
            `${recipientPhone} (${recipientName}) tried to use bot`,
          )
        }
        return
      }

      // ── TEXT MESSAGE ──────────────────────────────────────────────────────
      if (typeOfMessage === 'text_message') {

        // ════════════════════════════════════════════════════════════════════
        // 1) WALLET CREATION: User clicked "Create Wallet" → needs PIN first
        // ════════════════════════════════════════════════════════════════════
        if (text && walletCreationPending.has(recipientPhone)) {
          const pin = text.body.trim()
          if (!/^\d{4,6}$/.test(pin)) {
            await send(
              recipientPhone,
              recipientName,
              `❌ Invalid PIN. Please reply with a *4-6 digit number* (e.g. 1234).`,
            )
            try { await Whatsapp.markMessageAsRead({ message_id: messageId }) } catch {}
            return
          }

          // PIN is valid — now create wallet + set PIN on-chain
          const pendingData = walletCreationPending.get(recipientPhone)!
          try {
            await send(recipientPhone, recipientName, '⏳ Creating your wallet and setting PIN...')

            // Step 1: Create wallet on-chain
            const walletAddress = await createUser(recipientPhone, pendingData.name)

            // Step 2: Set PIN on-chain (hashed)
            await setUserPin(recipientPhone, pin)

            // Clean up
            walletCreationPending.delete(recipientPhone)

            await send(
              recipientPhone,
              recipientName,
              `✅ *Wallet created and PIN set!* 🔐\n\n` +
              `Your wallet address:\n\`${walletAddress}\`\n\n` +
              `_Your PIN will be required for every transaction._`,
            )
            await sendMenuTo(recipientPhone, recipientName)
          } catch (err) {
            // Clean up on failure so they can retry
            walletCreationPending.delete(recipientPhone)
            await send(
              recipientPhone,
              recipientName,
              `❌ Failed to create wallet. Please try again.\n${(err as Error).message}`,
            )
            // Re-show create wallet button
            await sendButtons(
              recipientPhone,
              recipientName,
              "Would you like to try again?",
              [{ title: 'Create a wallet', id: 'create_wallet' }],
            )
          }
          try { await Whatsapp.markMessageAsRead({ message_id: messageId }) } catch {}
          return
        }

        // ════════════════════════════════════════════════════════════════════
        // 2) EXISTING USER FLOWS
        // ════════════════════════════════════════════════════════════════════
        let user = null

        // Try blockchain lookup — but NEVER let it block the reply
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
          logSystem(`Blockchain lookup failed for ${recipientPhone}`, recipientPhone, errMsg)
          user = null
        }

        if (user) {
          const userId = user.address

          // ── Waiting for receiver phone/address ──────────────────────────
          if (text && (await isReceiverInputPending(userId))) {
            try {
              const validatedReceiver = await addReceiverToPayment({
                userId,
                receiver: text.body,
              })
              await sendButtons(
                recipientPhone,
                recipientName,
                `How many HLUSD to send to ${validatedReceiver}?`,
                [{ title: 'Cancel transaction', id: 'cancel_send_money' }],
              )
            } catch (err) {
              await sendButtons(
                recipientPhone,
                recipientName,
                `Invalid recipient ❌\nEnter a valid wallet address or registered phone.\n\n${(err as Error).message}`,
                [{ title: 'Cancel', id: 'cancel_send_money' }],
              )
            }
            try { await Whatsapp.markMessageAsRead({ message_id: messageId }) } catch {}
            return
          }

          // ── Waiting for PIN to authorize payment ─────────────────────────
          if (text && (await isUserAwaitingPin(userId))) {
            const enteredPin = text.body.trim()
            try {
              const pinValid = await verifyUserPin(recipientPhone, enteredPin)
              if (!pinValid) {
                await sendButtons(
                  recipientPhone,
                  recipientName,
                  `❌ Wrong PIN. Try again or cancel.`,
                  [{ title: 'Cancel transaction', id: 'cancel_send_money' }],
                )
                try { await Whatsapp.markMessageAsRead({ message_id: messageId }) } catch {}
                return
              }

              // PIN correct — execute payment
              await confirmPinAndFinalize(userId)
              const receiverUser = await getReceiverUserFromUncompletedPaymentRequest(userId)
              const senderPrivateKey = await getPrivateKeyByPhoneNumber(recipientPhone)
              const fromAddress = await getAddressByPhoneNumber(recipientPhone)
              const toAddress = await getRecipientAddressFromUncompletedPaymentRequest(userId)
              const amount = getAmountFromPendingRequest(userId)

              await sendHlusdFromWallet({
                tokenAmount: amount,
                privateKey: senderPrivateKey,
                toAddress,
              })

              await send(recipientPhone, recipientName, '✅ Payment successful! 🎉')
              if (receiverUser) {
                await send(receiverUser.phoneNumer, receiverUser.name, `You received ${amount} HLUSD from ${user.name} 🌟`)
                await sendMenuTo(receiverUser.phoneNumer, receiverUser.name)
              }
              const helaScanUrl = getHelaScanUrlForAddress(fromAddress)
              await send(recipientPhone, recipientName, helaScanUrl)
            } catch (err) {
              await updatePaymentRequestToError(userId)
              await send(recipientPhone, recipientName, `Payment failed 😢\n${(err as Error).message}`)
            }
            try { await Whatsapp.markMessageAsRead({ message_id: messageId }) } catch {}
            return
          }

          // ── Waiting for amount ────────────────────────────────────────────
          if (text && (await isUserAwaitingAmountInput(userId))) {
            let amount: number
            try {
              amount = transformStringToNumber(text.body)
            } catch {
              await sendButtons(
                recipientPhone,
                recipientName,
                `Invalid amount 🤕 Please enter a valid number (e.g. 10 or 0.5)`,
                [{ title: 'Cancel', id: 'cancel_send_money' }],
              )
              try { await Whatsapp.markMessageAsRead({ message_id: messageId }) } catch {}
              return
            }

            try {
              await confirmPaymentRequest({ userId, amount })

              // PIN is MANDATORY for ALL transactions — no bypass
              const pinSet = await checkIsPinSet(recipientPhone)
              if (!pinSet) {
                // User has wallet but no PIN — force them to set one
                await updatePaymentRequestToError(userId)
                await send(
                  recipientPhone,
                  recipientName,
                  `🔐 *You need to set a PIN before making transactions.*\n\n` +
                  `Please contact support or re-create your wallet to set a PIN.`,
                )
                await sendMenuTo(recipientPhone, recipientName)
              } else {
                // PIN is set — ask for it
                await send(
                  recipientPhone,
                  recipientName,
                  `🔐 Enter your *PIN* to confirm sending *${amount} HLUSD*:`,
                )
              }
            } catch (err) {
              await updatePaymentRequestToError(userId)
              await send(recipientPhone, recipientName, `Payment failed 😢\n${(err as Error).message}`)
            }

            try { await Whatsapp.markMessageAsRead({ message_id: messageId }) } catch {}
            return
          }

          // Returning user — show menu
          await send(recipientPhone, recipientName, `Welcome back${recipientName ? ` ${recipientName}` : ''}! 👋`)
          await sendMenuTo(recipientPhone, recipientName)
        } else {
          // ── NEW USER — welcome flow ────────────────────────────────────────
          await send(
            recipientPhone,
            recipientName,
            `Hi ${recipientName}! 👋 Welcome to *CryptoX*`,
          )
          await send(
            recipientPhone,
            recipientName,
            `CryptoX is a WhatsApp-native crypto wallet on *Hela Chain* ⛓️\n\n✅ Instant payments\n✅ Send & receive HLUSD\n✅ Non-custodial wallet\n✅ No app needed — just WhatsApp!`,
          )
          await sendButtons(
            recipientPhone,
            recipientName,
            "You don't have a wallet yet. Would you like to create one?",
            [{ title: 'Create a wallet', id: 'create_wallet' }],
          )
        }

        try { await Whatsapp.markMessageAsRead({ message_id: messageId }) } catch {}
        return
      }

      // ── BUTTON REPLY ──────────────────────────────────────────────────────
      if (typeOfMessage === 'simple_button_message') {
        const button_id = data.message.button_reply?.id
        console.log('Button pressed:', button_id)

        let user = null
        try {
          user = await Promise.race([
            getUserFromPhoneNumber(recipientPhone),
            new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('Blockchain timed out')), 8000),
            ),
          ])
        } catch (err) {
          logSystem(`Blockchain lookup failed for button ${button_id}`, recipientPhone, (err as Error).message)
        }

        try {
          switch (button_id) {
            case 'send_money': {
              if (!user) throw new Error('Wallet not found — please create one first')

              // Check PIN is set before allowing any transaction
              const pinSet = await checkIsPinSet(recipientPhone)
              if (!pinSet) {
                await send(
                  recipientPhone,
                  recipientName,
                  `🔐 *You need a PIN to make transactions.*\n\nPlease contact support or re-create your wallet.`,
                )
                break
              }

              await makePaymentRequest({ amount: null, fromUserId: user.address, to: null })
              await send(recipientPhone, recipientName, `Who would you like to send money to?`)
              await sendButtons(
                recipientPhone,
                recipientName,
                `Enter the recipient's phone number or wallet address`,
                [{ title: 'Cancel', id: 'cancel_send_money' }],
              )
              break
            }

            case 'check_balance': {
              await send(recipientPhone, recipientName, 'Loading ⏳')
              const privateKey = await getPrivateKeyByPhoneNumber(recipientPhone)
              const { hlusdBalance } = await getAccountBalances(privateKey)
              await send(recipientPhone, recipientName, `💰 Balance: *${hlusdBalance} HLUSD*`)
              await sendMenuTo(recipientPhone, recipientName)
              break
            }

            case 'check_address': {
              await send(recipientPhone, recipientName, 'Loading your deposit QR... ⏳')
              const address = await getAddressByPhoneNumber(recipientPhone)

              // Generate QR code via online API — no storage needed
              const qrSize = 400
              const qrData = encodeURIComponent(address)
              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${qrData}&format=png&margin=10`

              // Send QR image with address as caption
              try {
                await sendImageToPhoneNumber(
                  recipientPhone,
                  qrUrl,
                  `📥 *Your HeLa Chain Deposit Address*\n\n\`${address}\`\n\n_Scan this QR or copy the address above to receive HLUSD._`,
                )
              } catch {
                // Fallback: send as plain text if image fails
                await send(recipientPhone, recipientName, `📥 Your deposit address (HeLa Chain):`)
                await send(recipientPhone, recipientName, address)
              }

              await sendMenuTo(recipientPhone, recipientName)
              break
            }

            case 'create_wallet': {
              // ── NEW FLOW: Ask for PIN FIRST, then create wallet ────────────
              walletCreationPending.set(recipientPhone, { name: recipientName })
              await send(
                recipientPhone,
                recipientName,
                `🔐 *Set your transaction PIN*\n\n` +
                `Before creating your wallet, please reply with a *4-6 digit PIN*.\n\n` +
                `_This PIN will be required for every transaction. Keep it safe!_`,
              )
              break
            }

            case 'info_address': {
              await sendButtons(
                recipientPhone,
                recipientName,
                'Your address is like a bank account number. Share it to receive HLUSD on Hela Chain.',
                [{ title: 'What is HLUSD?', id: 'info_hlusd' }],
              )
              break
            }

            case 'info_hlusd': {
              await send(
                recipientPhone,
                recipientName,
                'HLUSD is the native currency of Hela Chain — used for payments and gas fees.\nhttps://helachain.com',
              )
              await sendMenuTo(recipientPhone, recipientName)
              break
            }

            case 'cancel_send_money': {
              if (!user) throw new Error('Wallet not found')
              await cancelPaymentRequest(user.address)
              await send(recipientPhone, recipientName, 'Transaction cancelled. ✋')
              await sendMenuTo(recipientPhone, recipientName)
              break
            }

            default: {
              console.log('Unknown button_id:', button_id)
              await sendMenuTo(recipientPhone, recipientName)
            }
          }
        } catch (err) {
          const errMsg = (err as Error).message || String(err)
          logSystem(`Button "${button_id}" handler error`, recipientPhone, errMsg)
          try {
            await send(recipientPhone, recipientName, `🔴 Error: ${errMsg}`)
          } catch {}
        }

        try { await Whatsapp.markMessageAsRead({ message_id: messageId }) } catch {}
        return
      }

      // Unknown type
      console.log('Unknown message type:', typeOfMessage)
      try { await Whatsapp.markMessageAsRead({ message_id: messageId }) } catch {}
    } catch (topErr) {
      const errMsg = (topErr as Error).message || String(topErr)
      console.error('Top-level webhook error:', errMsg)
      logSystem(`Top-level error in webhook`, recipientPhone, errMsg)
    }

    // ✅ Respond to Meta at the VERY END of execution.
    // In Vercel serverless, sending the response too early freezes the lambda.
    res.status(200).send('ok')
    return
  }

  res.status(405).json({ message: 'Method not allowed' })
}

export default handler
