require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// ── Load ABI and Bytecode from compiled artifact ──────────────────────────────
const artifactPath = path.join(__dirname, '../artifacts/contracts/CryptoX.sol/CryptoX.json');
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

async function main() {
  const rpcUrl = process.env.HELA_RPC_URL || 'https://testnet-rpc.helachain.com';
  const operatorKey = process.env.OPERATOR_PRIVATE_KEY;

  if (!operatorKey) {
    console.error('❌ OPERATOR_PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  console.log('🔗 Connecting to HeLa testnet:', rpcUrl);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(operatorKey, provider);

  console.log('📦 Deployer address:', wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log('💰 Balance:', ethers.formatEther(balance), 'HLUSD');

  if (balance === 0n) {
    console.error('❌ No funds! Fund the operator wallet first.');
    process.exit(1);
  }

  console.log('\n🚀 Deploying fresh CryptoX contract...');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy();

  console.log('⏳ Waiting for confirmation...');
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('\n✅ Contract deployed successfully!');
  console.log('📍 New Contract Address:', address);
  console.log('\n👉 Update your .env:');
  console.log(`CRYPTOX_CONTRACT_ADDRESS=${address}`);

  // Auto-update .env
  const envPath = path.join(__dirname, '../.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = envContent.replace(
    /CRYPTOX_CONTRACT_ADDRESS=.*/,
    `CRYPTOX_CONTRACT_ADDRESS=${address}`
  );
  fs.writeFileSync(envPath, envContent);
  console.log('\n✅ .env updated automatically!');
}

main().catch((err) => {
  console.error('❌ Deploy failed:', err.message);
  process.exit(1);
});
