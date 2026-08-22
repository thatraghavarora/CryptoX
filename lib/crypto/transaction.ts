import { ethers } from 'ethers'
import { User, getAddressByPhoneNumber, getUserFromPhoneNumber } from 'lib/user'
import { getContract, getProvider, getChainInfo } from '.'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'ADDRESS_PENDING' | 'AMOUNT_PENDING' | 'PIN_PENDING' | 'CONFIRMED' | 'CANCELLED' | 'ERROR'

type PaymentRequest = {
  id: string
  createdAt: string
  fromUserId: string
  to: string
  toUserId: string | null
  status: Status
  amount: number | null
  chain: string  // Added chain support
  currency: string
}

export type Address = string
export type PhoneNumber = string

// ─── In-memory payment flow state ────────────────────────────────────────────
// Note: resets on Lambda cold start — fine for short-lived transactions
const paymentRequestStore = new Map<string, PaymentRequest>()

export function getAmountFromPendingRequest(userId: string): number {
  const req = paymentRequestStore.get(userId)
  return req?.amount ?? 0
}

// ─── Multi-Chain Payment Request Helpers ──────────────────────────────────────

export async function makePaymentRequest({
  fromUserId,
  to,
  amount,
  chain = 'hela',
}: {
  fromUserId: string
  to: Address | PhoneNumber | null
  amount: number | null
  chain?: string
}): Promise<PaymentRequest> {
  const chainInfo = getChainInfo(chain)
  
  const paymentRequest: PaymentRequest = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    fromUserId,
    to: to || '',
    toUserId: null,
    status: 'ADDRESS_PENDING',
    amount,
    chain,
    currency: chainInfo.nativeCurrency,
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

export async function isUserAwaitingPin(userId: string): Promise<boolean> {
  const req = paymentRequestStore.get(userId)
  return req?.status === 'PIN_PENDING'
}

export async function getRecipientAddressFromUncompletedPaymentRequest(
  userId: string,
): Promise<string> {
  const req = paymentRequestStore.get(userId)
  if (!req || (req.status !== 'AMOUNT_PENDING' && req.status !== 'PIN_PENDING' && req.status !== 'CONFIRMED')) {
    throw new Error('No pending payment request found')
  }
  return req.to
}

export async function getReceiverUserFromUncompletedPaymentRequest(
  userId: string,
): Promise<User | null> {
  const req = paymentRequestStore.get(userId)
  if (!req || (req.status !== 'AMOUNT_PENDING' && req.status !== 'PIN_PENDING' && req.status !== 'CONFIRMED')) {
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
    req.status = 'PIN_PENDING' // Wait for PIN before executing
    paymentRequestStore.set(userId, req)
  }
}

export async function confirmPinAndFinalize(userId: string): Promise<void> {
  const req = paymentRequestStore.get(userId)
  if (req) {
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
  if (req && req.status !== 'CONFIRMED' && req.status !== 'CANCELLED' && req.status !== 'ERROR') {
    req.status = 'ERROR'
    paymentRequestStore.set(userId, req)
  }
}

// ─── Multi-Chain Transfer Functions ──────────────────────────────────────────

export async function sendCryptoFromWallet({
  tokenAmount,
  toAddress,
  privateKey,
  chain = 'hela',
}: {
  tokenAmount: number
  toAddress: string
  privateKey: string
  chain?: string
}): Promise<ethers.TransactionResponse> {
  try {
    const chainInfo = getChainInfo(chain)
    const provider = getProvider(chain)
    const wallet = new ethers.Wallet(privateKey, provider)
    const amountInWei = ethers.parseEther(String(tokenAmount))

    // 1. Send native currency on-chain
    const tx = await wallet.sendTransaction({ to: toAddress, value: amountInWei })
    await tx.wait()

    // 2. Record payment as on-chain event (cheap)
    const contract = getContract(wallet, chain)
    const contractTx = await contract.recordPayment(toAddress, amountInWei)
    await contractTx.wait()

    return tx
  } catch (error) {
    const msg = (error as Error).message || ''
    if (msg.includes('insufficient funds')) {
      throw new Error(`Insufficient ${getChainInfo(chain).nativeCurrency} balance to complete this transaction`)
    }
    throw error
  }
}

// ─── Multi-Chain Explorer URLs ───────────────────────────────────────────────

export function getExplorerUrlForAddress(address: string, chain: string = 'hela'): string {
  const chainInfo = getChainInfo(chain)
  return `${chainInfo.explorerUrl}/address/${address}`
}

export function getExplorerUrlForTx(txHash: string, chain: string = 'hela'): string {
  const chainInfo = getChainInfo(chain)
  return `${chainInfo.explorerUrl}/tx/${txHash}`
}

// ─── Get current payment request info ────────────────────────────────────────

export function getCurrentPaymentRequest(userId: string): PaymentRequest | null {
  return paymentRequestStore.get(userId) || null
}

export function getPaymentChain(userId: string): string | null {
  const req = paymentRequestStore.get(userId)
  return req?.chain || null
}

export function getPaymentCurrency(userId: string): string | null {
  const req = paymentRequestStore.get(userId)
  return req?.currency || null
}

// ─── Clean up old requests ───────────────────────────────────────────────────

export function cleanupOldRequests(maxAgeMinutes: number = 30): void {
  const now = Date.now()
  for (const [userId, req] of paymentRequestStore.entries()) {
    const requestAge = now - new Date(req.createdAt).getTime()
    if (requestAge > maxAgeMinutes * 60 * 1000) {
      paymentRequestStore.delete(userId)
    }
  }
}
