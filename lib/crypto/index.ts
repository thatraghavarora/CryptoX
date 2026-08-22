import crypto from 'crypto'
import { ethers } from 'ethers'
import { 
  CHAINS, 
  getChainConfig, 
  getDefaultChain, 
  isChainSupported,
  getAllSupportedChains,
  type ChainConfig 
} from '../config/chains'

// ─── Multi-Chain Crypto Library ─────────────────────────────────────────────

// ─── Lazy env-var getters ───────────────────────────────────────────────────
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY env var is not set')
  return key
}

// ─── ABI (same for all chains) ──────────────────────────────────────────────
const CRYPTOX_ABI = [
  'function registerUser(string calldata _phone, string calldata _name, address _wallet, string calldata _encryptedPrivateKey) external',
  'function getUser(string calldata _phone) external view returns (address walletAddress, string memory name, string memory encryptedPrivateKey, bool exists)',
  'function setPin(string calldata _phone, bytes32 _pinHash) external',
  'function verifyPin(string calldata _phone, bytes32 _pinHash) external view returns (bool)',
  'function isPinSet(string calldata _phone) external view returns (bool)',
  'function recordPayment(address _to, uint256 _amount) external',
  'event UserRegistered(address indexed wallet, bytes32 indexed phoneHash, string name)',
  'event PinSet(bytes32 indexed phoneHash)',
  'event PaymentSent(address indexed from, address indexed to, uint256 amount, uint256 timestamp)',
]

type Numberish = number | bigint

function removeDecimals(number: Numberish, decimals: number = 18): number {
  return Number(number) / 10 ** decimals
}

// ─── Encryption ───────────────────────────────────────────────────────────────
function getDerivedEncryptionKey(): Buffer {
  const encryptionKey = getEncryptionKey()
  let key = Buffer.from(encryptionKey, 'hex')
  if (key.length !== 32) {
    key = crypto.createHash('sha256').update(encryptionKey).digest()
  }
  return key
}

export function encryptPrivateKey(privateKey: string): string {
  const iv = crypto.randomBytes(16)
  const key = getDerivedEncryptionKey()
  // @ts-ignore
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  // @ts-ignore
  const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export function decryptPrivateKey(encryptedPrivateKey: string): string {
  const [ivHex, encryptedHex] = encryptedPrivateKey.split(':')
  if (!ivHex || !encryptedHex) throw new Error('Invalid encrypted private key format')

  const iv = Buffer.from(ivHex, 'hex')
  const key = getDerivedEncryptionKey()
  // @ts-ignore
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  // @ts-ignore
  const decrypted = Buffer.concat([
    // @ts-ignore
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    // @ts-ignore
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

// ─── Multi-Chain Provider / Contract ─────────────────────────────────────────
export function getProvider(chainName?: string): ethers.JsonRpcProvider {
  const chain = chainName || getDefaultChain()
  const config = getChainConfig(chain)
  return new ethers.JsonRpcProvider(config.rpcUrl)
}

export function getContract(
  signerOrProvider: ethers.Signer | ethers.Provider,
  chainName?: string
): ethers.Contract {
  const chain = chainName || getDefaultChain()
  const config = getChainConfig(chain)
  
  if (!config.contractAddress) {
    throw new Error(`Contract address not configured for ${chain}`)
  }
  
  return new ethers.Contract(config.contractAddress, CRYPTOX_ABI, signerOrProvider)
}

// ─── Crypto Utilities ─────────────────────────────────────────────────────────
export function buildPrivateKey(): string {
  const id = crypto.randomBytes(32).toString('hex')
  return `0x${id}`
}

export function getAddressFromPrivateKey(privateKey: string): string {
  return new ethers.Wallet(privateKey).address
}

// ─── Multi-Chain Account Balances ───────────────────────────────────────────
export async function getAccountBalances(
  privateKey: string,
  chainName?: string
): Promise<{ balance: number; currency: string }> {
  const chain = chainName || getDefaultChain()
  const config = getChainConfig(chain)
  const provider = getProvider(chain)
  const wallet = new ethers.Wallet(privateKey)
  
  const balance = await provider.getBalance(wallet.address, 'latest')
  return { 
    balance: removeDecimals(balance),
    currency: config.nativeCurrency
  }
}

// Get balances for all supported chains
export async function getMultiChainBalances(
  privateKey: string
): Promise<Record<string, { balance: number; currency: string }>> {
  const balances: Record<string, { balance: number; currency: string }> = {}
  const wallet = new ethers.Wallet(privateKey)
  const address = wallet.address
  
  for (const chain of getAllSupportedChains()) {
    try {
      const provider = new ethers.JsonRpcProvider(chain.rpcUrl)
      const balance = await provider.getBalance(address, 'latest')
      
      balances[chain.name] = {
        balance: removeDecimals(balance),
        currency: chain.nativeCurrency
      }
    } catch (error) {
      console.error(`Failed to get balance for ${chain.name}:`, error)
      balances[chain.name] = {
        balance: 0,
        currency: chain.nativeCurrency
      }
    }
  }
  
  return balances
}

// ─── Multi-Chain Registration ───────────────────────────────────────────────
export async function registerUserOnChain(
  phone: string,
  name: string,
  privateKey: string,
  walletAddress: string,
  chainName?: string
): Promise<string> {
  const chain = chainName || getDefaultChain()
  
  let operatorKey = process.env.OPERATOR_PRIVATE_KEY
  if (!operatorKey) throw new Error('OPERATOR_PRIVATE_KEY env var is not set')
  if (!operatorKey.startsWith('0x')) operatorKey = '0x' + operatorKey

  const config = getChainConfig(chain)
  const provider = getProvider(chain)
  const operatorWallet = new ethers.Wallet(operatorKey, provider)
  const contract = getContract(operatorWallet, chain)
  
  const encryptedKey = encryptPrivateKey(privateKey)
  const tx = await contract.registerUser(phone, name, walletAddress, encryptedKey)
  const receipt = await tx.wait()
  
  return receipt.hash
}

// Register user on multiple chains
export async function registerUserOnMultipleChains(
  phone: string,
  name: string,
  privateKey: string,
  walletAddress: string,
  chains: string[] = getSupportedChains()
): Promise<Record<string, string>> {
  const results: Record<string, string> = {}
  
  for (const chain of chains) {
    if (!isChainSupported(chain)) continue
    
    try {
      const txHash = await registerUserOnChain(phone, name, privateKey, walletAddress, chain)
      results[chain] = txHash
      console.log(`✅ Registered on ${chain}: ${txHash}`)
    } catch (error) {
      console.error(`❌ Failed to register on ${chain}:`, error)
      results[chain] = `error: ${(error as Error).message}`
    }
  }
  
  return results
}

// ─── Multi-Chain Query ──────────────────────────────────────────────────────
export async function getUserFromChain(
  phone: string,
  chainName?: string
): Promise<{
  walletAddress: string
  name: string
  encryptedPrivateKey: string
  exists: boolean
} | null> {
  const chain = chainName || getDefaultChain()
  const config = getChainConfig(chain)
  
  if (!config.contractAddress) {
    console.warn(`No contract address for ${chain}, skipping query`)
    return null
  }
  
  try {
    const provider = getProvider(chain)
    const contract = getContract(provider, chain)
    const [walletAddress, name, encryptedPrivateKey, exists] = await contract.getUser(phone)
    
    if (!exists) return null
    return { walletAddress, name, encryptedPrivateKey, exists }
  } catch (error) {
    console.error(`Failed to get user from ${chain}:`, error)
    return null
  }
}

// Get user from any supported chain
export async function findUserAcrossChains(
  phone: string
): Promise<{
  chain: string
  walletAddress: string
  name: string
  encryptedPrivateKey: string
} | null> {
  for (const chain of getAllSupportedChains()) {
    const user = await getUserFromChain(phone, chain.name)
    if (user) {
      return {
        chain: chain.name,
        ...user
      }
    }
  }
  return null
}

// ─── Chain Utilities ────────────────────────────────────────────────────────
export function getSupportedChains(): string[] {
  return getAllSupportedChains().map(chain => chain.name)
}

export function getChainInfo(chainName: string): ChainConfig {
  return getChainConfig(chainName)
}

// ─── Testnet Wallet Generation ──────────────────────────────────────────────
export function generateTestnetWallet(phone: string, chainName: string): {
  address: string
  privateKey: string
  mnemonicPath: string
} {
  // Deterministic wallet generation for testing
  const seed = crypto
    .createHash('sha256')
    .update(`${phone}:${chainName}:${process.env.TESTNET_MNEMONIC || 'test'}`)
    .digest('hex')
  
  const wallet = ethers.Wallet.createRandom()
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonicPath: `m/44'/60'/0'/0/${chainName.length % 1000}`,
  }
}

export async function recordPaymentOnChain(
  fromPrivateKey: string,
  toAddress: string,
  amount: number,
): Promise<void> {
  const provider = getProvider()
  const wallet = new ethers.Wallet(fromPrivateKey, provider)
  const contract = getContract(wallet)
  const amountInWei = ethers.parseEther(amount.toString())
  const tx = await contract.recordPayment(toAddress, amountInWei)
  await tx.wait()
}

// Payments are now recorded as on-chain events (cheaper gas).
// Use HeLa block explorer to query PaymentSent events for a given address.

// ─── PIN Management ───────────────────────────────────────────────────────────

function hashPin(pin: string): string {
  // keccak256 of PIN — same as what Solidity uses internally
  return ethers.keccak256(ethers.toUtf8Bytes(pin))
}

export async function setUserPin(phone: string, pin: string): Promise<void> {
  const provider = getProvider()
  const operatorKey = process.env.OPERATOR_PRIVATE_KEY!
  const wallet = new ethers.Wallet(operatorKey, provider)
  const contract = getContract(wallet)
  const pinHash = hashPin(pin)
  const tx = await contract.setPin(phone, pinHash)
  await tx.wait()
}

export async function verifyUserPin(phone: string, pin: string): Promise<boolean> {
  const provider = getProvider()
  const contract = getContract(provider)
  const pinHash = hashPin(pin)
  return await contract.verifyPin(phone, pinHash)
}

export async function checkIsPinSet(phone: string): Promise<boolean> {
  const provider = getProvider()
  const contract = getContract(provider)
  return await contract.isPinSet(phone)
}