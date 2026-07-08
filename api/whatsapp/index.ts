import type { VercelApiHandler, VercelResponse } from '@vercel/node'
import { WhatsappNewMessageEventNotificationRequest } from './types'
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
import { WhatsappParsedMessage } from './types'

// ─── Helper: send menu buttons ────────────────────────────────────────────────
async function sendMenuButtonsTo(phoneNumber: string) {
  await sendSimpleButtonsMessage(phoneNumber, 'What would you like to do?', [
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
  // ── GET: Webhook verification ──────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const mode = req.query['hub.mode']
      const token = req.query['hub.verify_token']
      const challenge = req.query['hub.challenge']

      console.log('GET /api/whatsapp', { mode, token, challenge })
      console.log('Expected token:', process.env.META_WA_VERIFY_TOKEN)

      if (
        mode &&
        token &&
        mode === 'subscribe' &&
        process.env.META_WA_VERIFY_TOKEN === token
      ) {
        console.log('Verification successful!')
        res.status(200).send(challenge)
        return
      }

      console.log('Verification failed — token mismatch or missing params')
      res.status(401).json({ message: 'Unauthorized' })
      return
    } catch (error) {
      console.error('GET handler error:', error)
      res.status(500).json({ message: 'Internal server error' })
      return
    }
  }

  // ── POST: Incoming WhatsApp message ─────────────────────────────────────────
  if (req.method === 'POST') {
    // Always respond 200 to Meta immediately to avoid retries
    res.status(200).send('ok')

    console.log('POST /api/whatsapp received')
    console.log('Body:', JSON.stringify(req.body, null, 2))

    try {
      const data: WhatsappParsedMessage = Whatsapp.parseMessage(req.body)
      console.log('Parsed message:', JSON.stringify(data, null, 2))

      if (!data?.isMessage) {
        console.log('Not a message event, ignoring...')
        return
      }

      const {
        message: {
          from: { phone: recipientPhone, name: recipientName },
          type: typeOfMessage,
          message_id: messageId,
          text,
        },
      } = data

      console.log(`Message from ${recipientPhone} (${recipientName}): type=${typeOfMessage}`)

      // ── Block Brazil numbers ──────────────────────────────────────────────
      const isBrazilNumber = recipientPhone.startsWith('55')
      if (isBrazilNumber) {
        if (process.env.ADMIN_PHONE_NUMBER && process.env.BRAZIL_MESSAGE) {
          await sendMessageToPhoneNumber(recipientPhone, process.env.BRAZIL_MESSAGE)
          await sendMessageToPhoneNumber(
            process.env.ADMIN_PHONE_NUMBER,
            `${recipientPhone} - ${recipientName} tried to use bot`,
          )
        }
        return
      }

      // ── Handle text messages ──────────────────────────────────────────────
      if (typeOfMessage === 'text_message') {
        console.log('Handling text_message...')

        try {
          const user = await getUserFromPhoneNumber(recipientPhone)
          console.log('User found:', user ? user.address : 'none')

          if (user) {
            const userId = user.address

            // User is mid-transaction: waiting for receiver input
            if (text && (await isReceiverInputPending(userId))) {
              const receiver: PhoneNumber | Address = text.body
              try {
                const validatedReceiver = await addReceiverToPayment({ userId, receiver })
                await sendSimpleButtonsMessage(
                  recipientPhone,
                  `How many HLUSD would you like to send to ${validatedReceiver}?`,
                  [{ title: 'Cancel transaction', id: 'cancel_send_money' }],
                )
              } catch (error) {
                await sendSimpleButtonsMessage(
                  recipientPhone,
                  `Invalid recipient ❌\nMake sure it's a valid wallet address or registered phone number.\n\n${error}`,
                  [{ title: 'Cancel transaction', id: 'cancel_send_money' }],
                )
              }
              await Whatsapp.markMessageAsRead({ message_id: messageId })
              return
            }

            // User is mid-transaction: waiting for amount input
            if (text && (await isUserAwaitingAmountInput(userId))) {
              let amount: number
              try {
                amount = transformStringToNumber(text.body)
              } catch {
                await sendSimpleButtonsMessage(
                  recipientPhone,
                  `Invalid amount 🤕 Please enter a valid number!`,
                  [{ title: 'Cancel transaction', id: 'cancel_send_money' }],
                )
                await Whatsapp.markMessageAsRead({ message_id: messageId })
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
                await sendMessageToPhoneNumber(recipientPhone, 'Payment successful! 🎉')

                if (receiverUser) {
                  await sendMessageToPhoneNumber(
                    receiverUser.phoneNumer,
                    `You received ${amount} HLUSD from ${user.name} 🌟`,
                  )
                  await sendMenuButtonsTo(receiverUser.phoneNumer)
                }

                const helaScanUrl = getHelaScanUrlForAddress(fromAddress)
                await sendMessageToPhoneNumber(recipientPhone, helaScanUrl)
              } catch (error) {
                await updatePaymentRequestToError(userId)
                await sendMessageToPhoneNumber(recipientPhone, `Payment could not be completed 😢`)
                await sendMessageToPhoneNumber(
                  recipientPhone,
                  `Error: ${(error as Error).message}`,
                )
              }

              await Whatsapp.markMessageAsRead({ message_id: messageId })
              return
            }

            // Normal returning user — show menu
            await sendMessageToPhoneNumber(
              recipientPhone,
              `Welcome back${recipientName ? ` ${recipientName}` : ''}! 👋`,
            )
            await sendMenuButtonsTo(recipientPhone)
          } else {
            // New user — welcome flow
            console.log('New user! Sending welcome message...')
            await sendMessageToPhoneNumber(
              recipientPhone,
              `Hi ${recipientName}! 👋 Welcome to *CryptoX*\nBuilt by Raghav Arora\n#Prayogam Project`,
            )
            await sendMessageToPhoneNumber(
              recipientPhone,
              `CryptoX is a WhatsApp-native crypto wallet powered by *Hela Chain* ⛓️\n\n✅ Instant payments\n✅ Send & receive HLUSD\n✅ Non-custodial wallet\n✅ No app needed — just WhatsApp!`,
            )
            await sendMessageToPhoneNumber(
              recipientPhone,
              `Create your *Hela Chain* wallet in seconds 🚀`,
            )
            await sendSimpleButtonsMessage(
              recipientPhone,
              "It looks like you don't have a wallet linked to this number. Would you like to create one?",
              [{ title: 'Create a wallet', id: 'create_wallet' }],
            )
          }
        } catch (error) {
          console.error('Error handling text_message:', error)
          try {
            await sendMessageToPhoneNumber(
              recipientPhone,
              `🔴 An error occurred: ${(error as Error).message}`,
            )
          } catch {}
        }

        try {
          await Whatsapp.markMessageAsRead({ message_id: messageId })
        } catch {}
        return
      }

      // ── Handle button replies ─────────────────────────────────────────────
      if (typeOfMessage === 'simple_button_message') {
        console.log('Handling button message...')
        const button_id = data.message.button_reply.id
        console.log('Button ID:', button_id)

        try {
          const user = await getUserFromPhoneNumber(recipientPhone)

          switch (button_id) {
            case 'send_money': {
              if (!user) throw new Error('User not found')
              await makePaymentRequest({ amount: null, fromUserId: user.address, to: null })
              await sendMessageToPhoneNumber(recipientPhone, `Who would you like to send money to?`)
              await sendSimpleButtonsMessage(
                recipientPhone,
                `Enter the recipient's phone number or wallet address`,
                [{ title: 'Cancel', id: 'cancel_send_money' }],
              )
              break
            }

            case 'check_balance': {
              await sendMessageToPhoneNumber(recipientPhone, 'Loading ⏳')
              const privateKey = await getPrivateKeyByPhoneNumber(recipientPhone)
              const { hlusdBalance } = await getAccountBalances(privateKey)
              await sendMessageToPhoneNumber(recipientPhone, `💰 Your balance: *${hlusdBalance} HLUSD*`)
              await sendMenuButtonsTo(recipientPhone)
              break
            }

            case 'check_address': {
              await sendMessageToPhoneNumber(recipientPhone, 'Loading ⏳')
              const address = await getAddressByPhoneNumber(recipientPhone)
              await sendMessageToPhoneNumber(
                recipientPhone,
                'To deposit funds, send HLUSD to this address:',
              )
              await sendMessageToPhoneNumber(recipientPhone, address)
              await sendMessageToPhoneNumber(recipientPhone, '(Hela Chain network only)')
              await sendMenuButtonsTo(recipientPhone)
              break
            }

            case 'create_wallet': {
              await sendMessageToPhoneNumber(recipientPhone, 'Creating your wallet! 🔨')
              const walletAddress = await createUser(recipientPhone, recipientName)
              await sendMessageToPhoneNumber(
                recipientPhone,
                'Your *CryptoX* wallet on *Hela Chain* has been created! 🚀✨\nYour address is:',
              )
              await sendSimpleButtonsMessage(recipientPhone, walletAddress, [
                { title: 'What is this?', id: 'info_address' },
              ])
              await sendMenuButtonsTo(recipientPhone)
              break
            }

            case 'info_address': {
              await sendSimpleButtonsMessage(
                recipientPhone,
                'An address is like a bank account number — others can send HLUSD to it. Your CryptoX wallet runs on Hela Chain.',
                [{ title: 'What is HLUSD?', id: 'info_hlusd' }],
              )
              await sendMenuButtonsTo(recipientPhone)
              break
            }

            case 'info_hlusd': {
              await sendMessageToPhoneNumber(
                recipientPhone,
                'HLUSD is the native currency of Hela Chain — used for instant payments and transaction fees.',
              )
              await sendMessageToPhoneNumber(
                recipientPhone,
                'For more info: https://helachain.com',
              )
              await sendMenuButtonsTo(recipientPhone)
              break
            }

            case 'cancel_send_money': {
              if (!user) throw new Error('User not found')
              await cancelPaymentRequest(user.address)
              await sendMessageToPhoneNumber(recipientPhone, 'Transaction cancelled.')
              await sendMenuButtonsTo(recipientPhone)
              break
            }

            default: {
              console.log('Unknown button_id:', button_id)
              await sendMenuButtonsTo(recipientPhone)
              break
            }
          }
        } catch (error) {
          console.error('Error handling button message:', error)
          try {
            await sendMessageToPhoneNumber(
              recipientPhone,
              `🔴 Error: ${(error as Error).message}`,
            )
          } catch {}
        }

        try {
          await Whatsapp.markMessageAsRead({ message_id: messageId })
        } catch {}
        return
      }

      // Unknown message type — still mark as read
      console.log('Unknown message type:', typeOfMessage)
      try {
        await Whatsapp.markMessageAsRead({ message_id: messageId })
      } catch {}
    } catch (error) {
      console.error('Top-level POST handler error:', error)
      // res already sent 200 to Meta — just log
    }

    return
  }

  // ── Other methods ───────────────────────────────────────────────────────────
  res.status(405).json({ message: 'Method not allowed' })
}

export default handler
