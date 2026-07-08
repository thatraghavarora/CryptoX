import type { VercelApiHandler, VercelResponse } from '@vercel/node'
import { WhatsappNewMessageEventNotificationRequest, WhatsappParsedMessage } from './types'
import {
  Whatsapp,
  sendMessageToPhoneNumber,
  sendSimpleButtonsMessage,
} from '../../lib/whatsapp'
import {
  getAddressByPhoneNumber,
  getPrivateKeyByPhoneNumber,
  getUserFromPhoneNumber,
  createUser,
} from '../../lib/user'
import { getAccountBalances } from '../../lib/crypto'
import {
  Address,
  PhoneNumber,
  addReceiverToPayment,
  cancelPaymentRequest,
  confirmPaymentRequest,
  getHelaScanUrlForAddress,
  getReceiverUserFromUncompletedPaymentRequest,
  getRecipientAddressFromUncompletedPaymentRequest,
  isReceiverInputPending,
  isUserAwaitingAmountInput,
  makePaymentRequest,
  sendHlusdFromWallet,
  updatePaymentRequestToError,
} from '../../lib/crypto/transaction'
import { transformStringToNumber } from '../../lib/utils/number'
import { messageLog, logIncoming, logOutgoing, logSystem } from '../../lib/message-log'

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

    if (mode === 'subscribe' && process.env.META_WA_VERIFY_TOKEN === token) {
      console.log('Webhook verification successful!')
      logSystem(`Webhook verified by Meta`)
      res.status(200).send(challenge)
      return
    }

    const expectedToken = process.env.META_WA_VERIFY_TOKEN || 'NOT_SET'
    const errorMsg = `Webhook verification FAILED — token mismatch. Expected: "${expectedToken}", Got: "${token}"`
    logSystem(errorMsg, 'SYSTEM')
    res.status(401).json({
      message: 'Unauthorized — verify token mismatch',
      debug_received: token,
      debug_expected_in_vercel: expectedToken
    })
    return
  }


  // ── POST: Incoming WhatsApp message ──────────────────────────────────────────
  if (req.method === 'POST') {
    console.log('POST /api/whatsapp — raw body:', JSON.stringify(req.body, null, 2))

    let recipientPhone = 'unknown'
    let recipientName = 'Unknown'
    let messageId = ''

    try {
      const data: WhatsappParsedMessage = Whatsapp.parseMessage(req.body)

      if (!data?.isMessage) {
        logSystem('Non-message webhook event received (status update / read receipt etc.)')
        return
      }

      const { message } = data
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
          // Treat as new user so they still get a response
          user = null
        }

        if (user) {
          const userId = user.address

          // Waiting for receiver phone/address
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

          // Waiting for amount
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
              const receiverUser = await getReceiverUserFromUncompletedPaymentRequest(userId)
              const senderPrivateKey = await getPrivateKeyByPhoneNumber(recipientPhone)
              const fromAddress = await getAddressByPhoneNumber(recipientPhone)

              await sendHlusdFromWallet({
                tokenAmount: amount,
                privateKey: senderPrivateKey,
                fromAddress,
                toAddress: await getRecipientAddressFromUncompletedPaymentRequest(userId),
              })
              await confirmPaymentRequest({ userId, amount })
              await send(recipientPhone, recipientName, 'Payment successful! 🎉')

              if (receiverUser) {
                await send(
                  receiverUser.phoneNumer,
                  receiverUser.name,
                  `You received ${amount} HLUSD from ${user.name} 🌟`,
                )
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

          // Returning user — show menu
          await send(recipientPhone, recipientName, `Welcome back${recipientName ? ` ${recipientName}` : ''}! 👋`)
          await sendMenuTo(recipientPhone, recipientName)
        } else {
          // ── NEW USER — welcome flow ────────────────────────────────────────
          await send(
            recipientPhone,
            recipientName,
            `Hi ${recipientName}! 👋 Welcome to *CryptoX*\nBuilt by Raghav Arora · #Prayogam Project`,
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
              await send(recipientPhone, recipientName, 'Loading ⏳')
              const address = await getAddressByPhoneNumber(recipientPhone)
              await send(recipientPhone, recipientName, 'Your deposit address (Hela Chain):')
              await send(recipientPhone, recipientName, address)
              await sendMenuTo(recipientPhone, recipientName)
              break
            }

            case 'create_wallet': {
              await send(recipientPhone, recipientName, 'Creating your wallet... 🔨')
              const walletAddress = await createUser(recipientPhone, recipientName)
              await send(recipientPhone, recipientName, '🚀 Wallet created on *Hela Chain*!\nYour address:')
              await sendButtons(recipientPhone, recipientName, walletAddress, [
                { title: 'What is this?', id: 'info_address' },
              ])
              await sendMenuTo(recipientPhone, recipientName)
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
