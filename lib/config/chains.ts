// Multi-chain configuration for CryptoX
export type ChainConfig = {
  name: string
  chainId: number
  rpcUrl: string
  contractAddress: string
  nativeCurrency: string
  explorerUrl: string
  isTestnet: boolean
  faucetUrl?: string
}

// Supported chains configuration
export const CHAINS: Record<string, ChainConfig> = {
  hela: {
    name: 'Hela Chain',
    chainId: 666888,
    rpcUrl: process.env.HELA_RPC_URL || 'https://testnet-rpc.helachain.com',
    contractAddress: process.env.HELA_CONTRACT_ADDRESS || process.env.CRYPTOX_CONTRACT_ADDRESS || '',
    nativeCurrency: 'HLUSD',
    explorerUrl: 'https://testnet.helascan.io',
    isTestnet: true,
    faucetUrl: 'https://testnet-faucet.helachain.com',
  },
  sepolia: {
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    rpcUrl: process.env.ETH_SEPOLIA_RPC || 'https://rpc.ankr.com/eth_sepolia',
    contractAddress: process.env.SEPOLIA_CONTRACT_ADDRESS || '',
    nativeCurrency: 'ETH',
    explorerUrl: 'https://sepolia.etherscan.io',
    isTestnet: true,
    faucetUrl: 'https://sepoliafaucet.com',
  },
  mumbai: {
    name: 'Polygon Mumbai',
    chainId: 80001,
    rpcUrl: process.env.POLYGON_MUMBAI_RPC || 'https://rpc.ankr.com/polygon_mumbai',
    contractAddress: process.env.MUMBAI_CONTRACT_ADDRESS || '',
    nativeCurrency: 'MATIC',
    explorerUrl: 'https://mumbai.polygonscan.com',
    isTestnet: true,
    faucetUrl: 'https://faucet.polygon.technology',
  },
  bsc_testnet: {
    name: 'BNB Smart Chain Testnet',
    chainId: 97,
    rpcUrl: process.env.BSC_TESTNET_RPC || 'https://rpc.ankr.com/bsc_testnet',
    contractAddress: process.env.BSC_TESTNET_CONTRACT_ADDRESS || '',
    nativeCurrency: 'BNB',
    explorerUrl: 'https://testnet.bscscan.com',
    isTestnet: true,
    faucetUrl: 'https://testnet.binance.org/faucet-smart',
  },
  base_sepolia: {
    name: 'Base Sepolia',
    chainId: 84532,
    rpcUrl: process.env.BASE_SEPOLIA_RPC || 'https://rpc.ankr.com/base_sepolia',
    contractAddress: process.env.BASE_SEPOLIA_CONTRACT_ADDRESS || '',
    nativeCurrency: 'ETH',
    explorerUrl: 'https://sepolia.basescan.org',
    isTestnet: true,
    faucetUrl: 'https://www.base.org/faucet',
  },
  arbitrum_sepolia: {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC || 'https://rpc.ankr.com/arbitrum_sepolia',
    contractAddress: process.env.ARBITRUM_SEPOLIA_CONTRACT_ADDRESS || '',
    nativeCurrency: 'ETH',
    explorerUrl: 'https://sepolia.arbiscan.io',
    isTestnet: true,
    faucetUrl: 'https://faucet.quicknode.com/arbitrum/sepolia',
  },
  avalanche_fuji: {
    name: 'Avalanche Fuji',
    chainId: 43113,
    rpcUrl: process.env.AVALANCHE_FUJI_RPC || 'https://rpc.ankr.com/avalanche_fuji',
    contractAddress: process.env.AVALANCHE_FUJI_CONTRACT_ADDRESS || '',
    nativeCurrency: 'AVAX',
    explorerUrl: 'https://testnet.snowtrace.io',
    isTestnet: true,
    faucetUrl: 'https://faucet.avax.network',
  },
}

// Get supported chains from environment
export function getSupportedChains(): string[] {
  const supportedChains = process.env.SUPPORTED_CHAINS || 'hela,sepolia,mumbai'
  return supportedChains.split(',').map(chain => chain.trim())
}

// Get default chain
export function getDefaultChain(): string {
  return process.env.DEFAULT_CHAIN || 'hela'
}

// Get chain configuration
export function getChainConfig(chainName?: string): ChainConfig {
  const chain = chainName || getDefaultChain()
  const config = CHAINS[chain]
  if (!config) throw new Error(`Chain ${chain} not configured`)
  return config
}

// Get all supported chain configurations
export function getAllSupportedChains(): ChainConfig[] {
  return getSupportedChains()
    .map(chainName => CHAINS[chainName])
    .filter(config => config !== undefined)
}

// Check if chain is supported
export function isChainSupported(chainName: string): boolean {
  return getSupportedChains().includes(chainName)
}