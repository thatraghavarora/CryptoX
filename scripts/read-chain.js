require('dotenv').config();
const { ethers } = require('ethers');

// ── ABI ───────────────────────────────────────────────────────────────────────
const ABI = [
  'function getUser(string calldata _phone) external view returns (address walletAddress, string memory name, string memory encryptedPrivateKey, bool exists)',
  'event UserRegistered(address indexed wallet, bytes32 indexed phoneHash, string name)',
  'event PaymentSent(address indexed from, address indexed to, uint256 amount, uint256 timestamp)',
];

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.HELA_RPC_URL);
  const contractAddress = process.env.CRYPTOX_CONTRACT_ADDRESS;
  const contract = new ethers.Contract(contractAddress, ABI, provider);

  console.log('═══════════════════════════════════════════');
  console.log('       CryptoX Blockchain Data Viewer      ');
  console.log('═══════════════════════════════════════════');
  console.log('📍 Contract:', contractAddress);
  console.log('');

  // ── 1. Query User by Phone ────────────────────────────────────────────────
  const phoneToCheck = process.argv[2]; // pass phone as: node read-chain.js 918949321383

  if (phoneToCheck) {
    console.log(`👤 Looking up user: ${phoneToCheck}`);
    try {
      const [walletAddress, name, encryptedPrivateKey, exists] = await contract.getUser(phoneToCheck);
      if (exists) {
        console.log('  ✅ User Found!');
        console.log('  📛 Name           :', name);
        console.log('  💼 Wallet Address :', walletAddress);
        console.log('  🔐 Encrypted Key  :', encryptedPrivateKey.substring(0, 30) + '...');

        // Get wallet balance
        const balance = await provider.getBalance(walletAddress);
        console.log('  💰 Balance        :', ethers.formatEther(balance), 'HLUSD');
      } else {
        console.log('  ❌ User not found on chain');
      }
    } catch (err) {
      console.log('  ❌ Error:', err.message);
    }
    console.log('');
  }

  // ── 2. All Registered Users (via events) ────────────────────────────────
  console.log('📋 All Registered Users (from events):');
  try {
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 99); // HeLa limit: max 100 blocks
    const filter = contract.filters.UserRegistered();
    const events = await contract.queryFilter(filter, fromBlock, latestBlock);

    if (events.length === 0) {
      console.log('  (no users registered in last 100 blocks)');
    } else {
      for (const e of events) {
        console.log(`  ─ Name: ${e.args.name} | Wallet: ${e.args.wallet}`);
      }
    }
  } catch (err) {
    console.log('  ❌ Error fetching users:', err.message);
  }

  console.log('');

  // ── 3. All Payments (via events) ─────────────────────────────────────────
  console.log('💸 All Payments (from events):');
  try {
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 99);
    const filter = contract.filters.PaymentSent();
    const events = await contract.queryFilter(filter, fromBlock, latestBlock);

    if (events.length === 0) {
      console.log('  (no payments in last 100 blocks)');
    } else {
      for (const e of events) {
        const date = new Date(Number(e.args.timestamp) * 1000).toISOString();
        console.log(`  ─ From: ${e.args.from}`);
        console.log(`    To  : ${e.args.to}`);
        console.log(`    Amt : ${ethers.formatEther(e.args.amount)} HLUSD`);
        console.log(`    Time: ${date}`);
        console.log('');
      }
    }
  } catch (err) {
    console.log('  ❌ Error fetching payments:', err.message);
  }

  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);
