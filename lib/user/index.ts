import {
  buildPrivateKey,
  getAddressFromPrivateKey,
  getUserFromChain,
  registerUserOnChain,
  decryptPrivateKey,
  findUserAcrossChains,
  registerUserOnMultipleChains,
  getChainInfo,
} from '../crypto'

export type User = {
  privateKey: string
  createdAt: string
  phoneNumer: string
  name: string
  address: string
  chain: string  // Which chain the user is registered on
  wallets: Record<string, string>  // Addresses on different chains
}

// Multi-chain user data storage (in-memory for now)
const userChainMap = new Map<string, string>() // phone -> primary chain

export async function isUserRegistered(
  recipientPhone: string,
  chain?: string
): Promise<boolean> {
  const user = await getUserFromChain(recipientPhone, chain)
  return user !== null && user.exists
}

export async function getPrivateKeyByPhoneNumber(
  recipientPhone: string,
  chain?: string
): Promise<string> {
  const user = await getUserFromChain(recipientPhone, chain)
  if (!user || !user.exists) {
    throw new Error(`User not found for phone: ${recipientPhone} on chain ${chain || 'any'}`)
  }
  return decryptPrivateKey(user.encryptedPrivateKey)
}

export async function getAddressByPhoneNumber(
  recipientPhone: string,
  chain?: string
): Promise<string> {
  const user = await getUserFromChain(recipientPhone, chain)
  if (!user || !user.exists) {
    throw new Error(`User not found on chain ${chain || 'any'}`)
  }
  return user.walletAddress
}

export async function getUserFromPhoneNumber(
  recipientPhone: string,
  chain?: string
): Promise<User | null> {
  const sanitizedPhone = recipientPhone.replace(/[^0-9.]/g, '')
  
  let userData;
  if (chain) {
    // Get user from specific chain
    userData = await getUserFromChain(sanitizedPhone, chain)
  } else {
    // Find user across all chains
    const foundUser = await findUserAcrossChains(sanitizedPhone)
    if (!foundUser) return null
    userData = {
      walletAddress: foundUser.walletAddress,
      name: foundUser.name,
      encryptedPrivateKey: foundUser.encryptedPrivateKey,
      exists: true,
    }
    chain = foundUser.chain
  }
  
  if (!userData || !userData.exists) return null
  
  const privateKey = decryptPrivateKey(userData.encryptedPrivateKey)
  
  // Store which chain this user is on
  userChainMap.set(sanitizedPhone, chain || 'hela')
  
  return {
    createdAt: new Date().toISOString(),
    name: userData.name,
    phoneNumer: sanitizedPhone,
    privateKey,
    address: userData.walletAddress,
    chain: chain || 'hela',
    wallets: {
      [chain || 'hela']: userData.walletAddress,
    },
  }
}

export async function getUserFromId(_userId: string): Promise<User> {
  // _userId is the wallet address on-chain
  throw new Error(
    'getUserFromId is not supported in on-chain mode. Use getUserFromPhoneNumber instead.',
  )
}

export async function getAddressByUserId(_userId: string): Promise<string> {
  throw new Error(
    'getAddressByUserId is not supported in on-chain mode. Use getAddressByPhoneNumber instead.',
  )
}

// Create user on single chain
export async function createUser(
  recipientPhone: string,
  recipientName?: string,
  chain?: string
): Promise<{ address: string; chain: string; privateKey: string }> {
  const privateKey = buildPrivateKey()
  const userAddress = getAddressFromPrivateKey(privateKey)
  const selectedChain = chain || 'hela'

  await registerUserOnChain(
    recipientPhone,
    recipientName || '',
    privateKey,
    userAddress,
    selectedChain
  )

  userChainMap.set(recipientPhone, selectedChain)

  return {
    address: userAddress,
    chain: selectedChain,
    privateKey,
  }
}

// Create user on multiple chains
export async function createUserOnMultipleChains(
  recipientPhone: string,
  recipientName?: string,
  chains?: string[]
): Promise<Record<string, { address: string; privateKey: string }>> {
  const privateKey = buildPrivateKey()
  const userAddress = getAddressFromPrivateKey(privateKey)
  
  const registrationResults = await registerUserOnMultipleChains(
    recipientPhone,
    recipientName || '',
    privateKey,
    userAddress,
    chains
  )
  
  // Store primary chain (first successful registration)
  const successfulChains = Object.keys(registrationResults).filter(
    chain => !registrationResults[chain].startsWith('error:')
  )
  
  if (successfulChains.length > 0) {
    userChainMap.set(recipientPhone, successfulChains[0])
  }
  
  const result: Record<string, { address: string; privateKey: string }> = {}
  for (const chain of successfulChains) {
    result[chain] = {
      address: userAddress,
      privateKey,
    }
  }
  
  return result
}

// Get user's primary chain
export function getUserPrimaryChain(phone: string): string | null {
  return userChainMap.get(phone) || null
}

// Get chain info for a user
export function getUserChainInfo(phone: string): ReturnType<typeof getChainInfo> | null {
  const chain = userChainMap.get(phone)
  if (!chain) return null
  return getChainInfo(chain)
}