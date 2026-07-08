import crypto from 'crypto'
import { ethers } from 'ethers'

// ─── Lazy env-var getters (safe for serverless — no module-level throws) ──────

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY env var is not set')
  return key
}

function getRpcUrl(): string {
  const url = process.env.HELA_RPC_URL
  if (!url) throw new Error('HELA_RPC_URL env var is not set')
  return url
}

function getContractAddress(): string {
  const addr = process.env.CRYPTOX_CONTRACT_ADDRESS
  if (!addr) throw new Error('CRYPTOX_CONTRACT_ADDRESS env var is not set')
  return addr
}

// ─── ABI ─────────────────────────────────────────────────────────────────────
const CRYPTOX_ABI = [
  'function registerUser(string memory _phone, string memory _name, address _wallet, string memory _encryptedPrivateKey) public',
  'function getUser(string memory _phone) public view returns (address, string memory, string memory, bool)',
  'function createPaymentRequest(address _to, uint256 _amount) public',
  'function getPaymentRequests(address _user) public view returns (tuple(address fromAddress, address toAddress, uint256 amount, string status, uint256 createdAt)[])',
  'event UserRegistered(address indexed wallet, string name)',
  'event PaymentCreated(address indexed from, address indexed to, uint256 amount)',
]

type Numberish = number | bigint

function removeDecimals(number: Numberish): number {
  return Number(number) / 10 ** 18
}

// ─── Encryption ───────────────────────────────────────────────────────────────

function getDerivedEncryptionKey(): Buffer {
  const encryptionKey = getEncryptionKey()
  let key = Buffer.from(encryptionKey, 'hex')
  // If not exactly 32 bytes (64 hex chars), hash it to get a valid 32-byte AES key
  if (key.length !== 32) {
    key = crypto.createHash('sha256').update(encryptionKey).digest()
  }
  return key
}

export function encryptPrivateKey(privateKey: string): string {
  const iv = crypto.randomBytes(16)
  const key = getDerivedEncryptionKey()
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export function decryptPrivateKey(encryptedPrivateKey: string): string {
  const [ivHex, encryptedHex] = encryptedPrivateKey.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const key = getDerivedEncryptionKey()
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

// ─── Provider / Contract ──────────────────────────────────────────────────────

export function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(getRpcUrl())
}

export function getContract(
  signerOrProvider: ethers.Signer | ethers.Provider,
): ethers.Contract {
  return new ethers.Contract(getContractAddress(), CRYPTOX_ABI, signerOrProvider)
}

// ─── Crypto Utilities ─────────────────────────────────────────────────────────

export function buildPrivateKey(): string {
  const id = crypto.randomBytes(32).toString('hex')
  return `0x${id}`
}

export function getAddressFromPrivateKey(privateKey: string): string {
  return new ethers.Wallet(privateKey).address
}

// ─── Account Balances ─────────────────────────────────────────────────────────

export async function getAccountBalances(
  privateKey: string,
): Promise<{ hlusdBalance: number }> {
  const provider = getProvider()
  const wallet = new ethers.Wallet(privateKey)
  const hlusdBalance = await provider.getBalance(wallet.address, 'latest')
  return { hlusdBalance: removeDecimals(hlusdBalance) }
}

// ─── Chain Registration ───────────────────────────────────────────────────────

export async function registerUserOnChain(
  phone: string,
  name: string,
  privateKey: string,
  walletAddress: string,
): Promise<void> {
  let operatorKey = process.env.OPERATOR_PRIVATE_KEY
  if (!operatorKey) throw new Error('OPERATOR_PRIVATE_KEY env var is not set')
  if (!operatorKey.startsWith('0x')) operatorKey = '0x' + operatorKey

  const provider = getProvider()
  const operatorWallet = new ethers.Wallet(operatorKey, provider)
  const contract = getContract(operatorWallet)
  const encryptedKey = encryptPrivateKey(privateKey)
  const tx = await contract.registerUser(phone, name, walletAddress, encryptedKey)
  await tx.wait()
}

// ─── Chain Query ──────────────────────────────────────────────────────────────

export async function getUserFromChain(phone: string): Promise<{
  walletAddress: string
  name: string
  encryptedPrivateKey: string
  exists: boolean
} | null> {
  const provider = getProvider()
  const contract = getContract(provider)
  const [walletAddress, name, encryptedPrivateKey, exists] = await contract.getUser(phone)
  if (!exists) return null
  return { walletAddress, name, encryptedPrivateKey, exists }
}

export async function createPaymentRequestOnChain(
  fromPrivateKey: string,
  toAddress: string,
  amount: number,
): Promise<void> {
  const provider = getProvider()
  const wallet = new ethers.Wallet(fromPrivateKey, provider)
  const contract = getContract(wallet)
  const amountInWei = ethers.parseEther(amount.toString())
  const tx = await contract.createPaymentRequest(toAddress, amountInWei)
  await tx.wait()
}

export async function getPaymentRequestsFromChain(userAddress: string): Promise<
  {
    fromAddress: string
    toAddress: string
    amount: number
    status: string
    createdAt: number
  }[]
> {
  const provider = getProvider()
  const contract = getContract(provider)
  const requests = await contract.getPaymentRequests(userAddress)
  return requests.map((r: any) => ({
    fromAddress: r.fromAddress,
    toAddress: r.toAddress,
    amount: removeDecimals(r.amount),
    status: r.status,
    createdAt: Number(r.createdAt),
  }))
}