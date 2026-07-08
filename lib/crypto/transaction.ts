import { ethers } from 'ethers'
import { User, getAddressByPhoneNumber, getUserFromPhoneNumber } from 'lib/user'
import { getContract, getProvider } from '.'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'ADDRESS_PENDING' | 'AMOUNT_PENDING' | 'CONFIRMED' | 'CANCELLED' | 'ERROR'

type PaymentRequest = {
  id: string
  createdAt: string
  fromUserId: string
  to: string
  toUserId: string | null
  status: Status
  amount: number | null
}

export type Address = string
export type PhoneNumber = string

// ─── In-memory payment flow state ────────────────────────────────────────────
// Note: resets on Lambda cold start — fine for short-lived transactions
const paymentRequestStore = new Map<string, PaymentRequest>()

// ─── Payment Request Helpers ──────────────────────────────────────────────────

export async function makePaymentRequest({
  fromUserId,
  to,
  amount,
}: {
  fromUserId: string
  to: Address | PhoneNumber | null
  amount: number | null
}): Promise<PaymentRequest> {
  const paymentRequest: PaymentRequest = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    fromUserId,
    to: to || '',
    toUserId: null,
    status: 'ADDRESS_PENDING',
    amount,
  }
  paymentRequestStore.set(fromUserId, paymentRequest)
  return paymentRequest
}

export async function getUserPaymentRequests(userId: string): Promise<PaymentRequest[]> {
  const req = paymentRequestStore.get(userId)
  return req ? [req] : []
}

export async function isReceiverInputPending(userId: string): Promise<boolean> {
  const req = paymentRequestStore.get(userId)
  return req?.status === 'ADDRESS_PENDING'
}

export async function isUserAwaitingAmountInput(userId: string): Promise<boolean> {
  const req = paymentRequestStore.get(userId)
  return req?.status === 'AMOUNT_PENDING'
}

export async function getRecipientAddressFromUncompletedPaymentRequest(
  userId: string,
): Promise<string> {
  const req = paymentRequestStore.get(userId)
  if (!req || req.status !== 'AMOUNT_PENDING') {
    throw new Error('No pending payment request found')
  }
  return req.to
}

export async function getReceiverUserFromUncompletedPaymentRequest(
  userId: string,
): Promise<User | null> {
  const req = paymentRequestStore.get(userId)
  if (!req || req.status !== 'AMOUNT_PENDING') {
    throw new Error('No pending payment request found')
  }
  if (!req.toUserId) return null
  return getUserFromPhoneNumber(req.toUserId)
}

export async function addReceiverToPayment({
  userId,
  receiver,
}: {
  userId: string
  receiver: string
}): Promise<string> {
  const isAddress = ethers.isAddress(receiver)
  const receiverUser = await getUserFromPhoneNumber(receiver)

  if (!isAddress && !receiverUser) {
    throw new Error(
      `Invalid recipient. Enter a valid wallet address or a registered phone number.`,
    )
  }

  const receiverAddress = isAddress ? receiver : await getAddressByPhoneNumber(receiver)

  const req = paymentRequestStore.get(userId)
  if (req) {
    req.to = receiverAddress
    req.toUserId = receiverUser?.phoneNumer || null
    req.status = 'AMOUNT_PENDING'
    paymentRequestStore.set(userId, req)
  }

  return receiverUser?.name || receiver
}

export async function confirmPaymentRequest({
  userId,
  amount,
}: {
  userId: string
  amount: number
}): Promise<void> {
  const req = paymentRequestStore.get(userId)
  if (req) {
    req.amount = amount
    req.status = 'CONFIRMED'
    paymentRequestStore.set(userId, req)
  }
}

export async function cancelPaymentRequest(userId: string): Promise<void> {
  const req = paymentRequestStore.get(userId)
  if (req && req.status !== 'CONFIRMED' && req.status !== 'CANCELLED' && req.status !== 'ERROR') {
    req.status = 'CANCELLED'
    paymentRequestStore.set(userId, req)
  }
}

export async function updatePaymentRequestToError(userId: string): Promise<void> {
  const req = paymentRequestStore.get(userId)
  if (req && req.status === 'AMOUNT_PENDING') {
    req.status = 'ERROR'
    paymentRequestStore.set(userId, req)
  }
}

// ─── On-chain Transfer ────────────────────────────────────────────────────────

export async function sendHlusdFromWallet({
  tokenAmount,
  toAddress,
  privateKey,
  fromAddress,
}: {
  tokenAmount: number
  toAddress: string
  privateKey: string
  fromAddress: string
}): Promise<ethers.TransactionResponse> {
  try {
    const provider = getProvider()
    const wallet = new ethers.Wallet(privateKey, provider)
    const amountInWei = ethers.parseEther(String(tokenAmount))

    // 1. Send HLUSD on-chain
    const tx = await wallet.sendTransaction({ to: toAddress, value: amountInWei })
    await tx.wait()

    // 2. Record payment on smart contract
    const contract = getContract(wallet)
    const contractTx = await contract.createPaymentRequest(toAddress, amountInWei)
    await contractTx.wait()

    return tx
  } catch (error) {
    const msg = (error as Error).message || ''
    if (msg.includes('insufficient funds')) {
      throw new Error('Insufficient HLUSD balance to complete this transaction')
    }
    throw error
  }
}

export function getHelaScanUrlForAddress(address: string): string {
  return `https://testnet.helascan.io/address/${address}`
}
