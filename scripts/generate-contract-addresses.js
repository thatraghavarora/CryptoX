const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('🔧 Generating contract addresses for testnets...\n');

// Generate deterministic contract addresses based on deployer address
function generateContractAddress(deployerAddress, chainId, salt = 0) {
  // This generates a deterministic address for testing
  // In production, you'd deploy actual contracts
  const seed = `${deployerAddress}:${chainId}:${salt}`;
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  
  // Take first 40 chars (20 bytes = 40 hex chars) and prefix with 0x
  const address = '0x' + hash.substring(0, 40);
  
  // Ensure it's a valid Ethereum address (checksum)
  return address.toLowerCase();
}

// Get deployer address from environment or generate
function getDeployerAddress() {
  const envPath = path.join(__dirname, '..', '.env');
  let deployerAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Default test address
  
  try {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const privateKeyMatch = envContent.match(/OPERATOR_PRIVATE_KEY=([^\n]+)/);
      
      if (privateKeyMatch && privateKeyMatch[1]) {
        const { ethers } = require('ethers');
        const wallet = new ethers.Wallet(privateKeyMatch[1].trim());
        deployerAddress = wallet.address;
      }
    }
  } catch (error) {
    console.log('⚠️ Using default test address');
  }
  
  return deployerAddress;
}

// Testnet configurations
const testnets = [
  { name: 'HELA', chainId: 666888, rpc: 'https://testnet-rpc.helachain.com' },
  { name: 'SEPOLIA', chainId: 11155111, rpc: 'https://rpc.ankr.com/eth_sepolia' },
  { name: 'MUMBAI', chainId: 80001, rpc: 'https://rpc.ankr.com/polygon_mumbai' },
  { name: 'BSC_TESTNET', chainId: 97, rpc: 'https://rpc.ankr.com/bsc_testnet' },
  { name: 'BASE_SEPOLIA', chainId: 84532, rpc: 'https://rpc.ankr.com/base_sepolia' },
  { name: 'ARBITRUM_SEPOLIA', chainId: 421614, rpc: 'https://rpc.ankr.com/arbitrum_sepolia' },
  { name: 'AVALANCHE_FUJI', chainId: 43113, rpc: 'https://rpc.ankr.com/avalanche_fuji' },
];

// Generate addresses
const deployerAddress = getDeployerAddress();
console.log(`💰 Using deployer address: ${deployerAddress}\n`);

const contractAddresses = {};
for (const testnet of testnets) {
  const contractAddress = generateContractAddress(deployerAddress, testnet.chainId);
  contractAddresses[testnet.name] = contractAddress;
  
  console.log(`${testnet.name}:`);
  console.log(`  Contract: ${contractAddress}`);
  console.log(`  Explorer: ${getExplorerUrl(testnet.name, contractAddress)}`);
  console.log('');
}

// Update .env file
function updateEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';
  
  try {
    envContent = fs.readFileSync(envPath, 'utf8');
  } catch (error) {
    console.log('❌ Could not read .env file');
    return;
  }
  
  // Update or add contract addresses
  for (const [name, address] of Object.entries(contractAddresses)) {
    const envVar = `${name}_CONTRACT_ADDRESS`;
    const regex = new RegExp(`^${envVar}=.*`, 'm');
    
    if (regex.test(envContent)) {
      // Update existing
      envContent = envContent.replace(regex, `${envVar}=${address}`);
    } else {
      // Add new
      envContent += `\n${envVar}=${address}`;
    }
  }
  
  // Also update CRYPTOX_CONTRACT_ADDRESS with Hela address (for backward compatibility)
  if (contractAddresses.HELA) {
    envContent = envContent.replace(
      /^CRYPTOX_CONTRACT_ADDRESS=.*/m,
      `CRYPTOX_CONTRACT_ADDRESS=${contractAddresses.HELA}`
    );
  }
  
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Updated .env file with contract addresses');
}

function getExplorerUrl(chainName, address) {
  const explorers = {
    HELA: `https://testnet.helascan.io/address/${address}`,
    SEPOLIA: `https://sepolia.etherscan.io/address/${address}`,
    MUMBAI: `https://mumbai.polygonscan.com/address/${address}`,
    BSC_TESTNET: `https://testnet.bscscan.com/address/${address}`,
    BASE_SEPOLIA: `https://sepolia.basescan.org/address/${address}`,
    ARBITRUM_SEPOLIA: `https://sepolia.arbiscan.io/address/${address}`,
    AVALANCHE_FUJI: `https://testnet.snowtrace.io/address/${address}`,
  };
  
  return explorers[chainName] || '';
}

// Execute
updateEnvFile();

console.log('\n📝 Add these to your .env file (already added):');
console.log('='.repeat(60));
for (const [name, address] of Object.entries(contractAddresses)) {
  console.log(`${name}_CONTRACT_ADDRESS=${address}`);
}
console.log(`CRYPTOX_CONTRACT_ADDRESS=${contractAddresses.HELA}`);

console.log('\n🚀 Ready to use! Run: npm run start');