const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying CryptoX contracts to multiple testnets...\n");
  
  const testnets = [
    { 
      name: "hela", 
      chainId: 666888,
      rpcUrl: process.env.HELA_RPC_URL || "https://testnet-rpc.helachain.com"
    },
    { 
      name: "sepolia", 
      chainId: 11155111,
      rpcUrl: process.env.ETH_SEPOLIA_RPC || "https://rpc.ankr.com/eth_sepolia"
    },
    { 
      name: "mumbai", 
      chainId: 80001,
      rpcUrl: process.env.POLYGON_MUMBAI_RPC || "https://rpc.ankr.com/polygon_mumbai"
    },
    { 
      name: "bsc_testnet", 
      chainId: 97,
      rpcUrl: process.env.BSC_TESTNET_RPC || "https://rpc.ankr.com/bsc_testnet"
    },
    { 
      name: "base_sepolia", 
      chainId: 84532,
      rpcUrl: process.env.BASE_SEPOLIA_RPC || "https://rpc.ankr.com/base_sepolia"
    },
    { 
      name: "arbitrum_sepolia", 
      chainId: 421614,
      rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC || "https://rpc.ankr.com/arbitrum_sepolia"
    },
    { 
      name: "avalanche_fuji", 
      chainId: 43113,
      rpcUrl: process.env.AVALANCHE_FUJI_RPC || "https://rpc.ankr.com/avalanche_fuji"
    },
  ];

  const deployments = {};

  for (const testnet of testnets) {
    try {
      console.log(`\n📡 Deploying to ${testnet.name.toUpperCase()}...`);
      
      // Check if we have operator private key
      const operatorKey = process.env.OPERATOR_PRIVATE_KEY;
      if (!operatorKey) {
        console.log(`⚠️  Skipping ${testnet.name}: OPERATOR_PRIVATE_KEY not set`);
        continue;
      }

      // Set network configuration
      hre.config.networks[testnet.name] = {
        url: testnet.rpcUrl,
        chainId: testnet.chainId,
        accounts: [operatorKey],
      };

      // Switch to this network
      const provider = new hre.ethers.JsonRpcProvider(testnet.rpcUrl);
      const wallet = new hre.ethers.Wallet(operatorKey, provider);
      
      console.log(`💰 Using address: ${wallet.address}`);
      
      // Check balance
      const balance = await provider.getBalance(wallet.address);
      console.log(`💎 Balance: ${hre.ethers.formatEther(balance)} ETH`);
      
      if (balance === 0n) {
        console.log(`⚠️  Skipping ${testnet.name}: Insufficient balance`);
        continue;
      }

      // Deploy contract
      const CryptoX = await hre.ethers.getContractFactory("CryptoX", wallet);
      const cryptoX = await CryptoX.deploy();
      await cryptoX.waitForDeployment();
      
      const address = await cryptoX.getAddress();
      
      deployments[testnet.name] = {
        contractAddress: address,
        chainId: testnet.chainId,
        explorerUrl: getExplorerUrl(testnet.name, address),
        deploymentTx: cryptoX.deploymentTransaction()?.hash,
      };
      
      console.log(`✅ Successfully deployed to ${testnet.name}`);
      console.log(`   Contract: ${address}`);
      console.log(`   Explorer: ${getExplorerUrl(testnet.name, address)}`);
      
    } catch (error) {
      console.error(`❌ Failed to deploy to ${testnet.name}:`, error.message);
    }
  }

  console.log("\n📊 Deployment Summary:");
  console.log("=".repeat(50));
  
  for (const [chain, info] of Object.entries(deployments)) {
    console.log(`${chain.toUpperCase()}:`);
    console.log(`  Contract: ${info.contractAddress}`);
    console.log(`  Explorer: ${info.explorerUrl}`);
    console.log("");
  }

  // Generate .env.example with deployment results
  console.log("\n📝 Add these to your .env file:");
  console.log("=".repeat(50));
  
  for (const [chain, info] of Object.entries(deployments)) {
    console.log(`${chain.toUpperCase()}_CONTRACT_ADDRESS=${info.contractAddress}`);
  }
  
  return deployments;
}

function getExplorerUrl(chainName, address) {
  const explorers = {
    hela: `https://testnet.helascan.io/address/${address}`,
    sepolia: `https://sepolia.etherscan.io/address/${address}`,
    mumbai: `https://mumbai.polygonscan.com/address/${address}`,
    bsc_testnet: `https://testnet.bscscan.com/address/${address}`,
    base_sepolia: `https://sepolia.basescan.org/address/${address}`,
    arbitrum_sepolia: `https://sepolia.arbiscan.io/address/${address}`,
    avalanche_fuji: `https://testnet.snowtrace.io/address/${address}`,
  };
  
  return explorers[chainName] || "";
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});