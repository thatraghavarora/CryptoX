require("@nomicfoundation/hardhat-ethers");
require("dotenv").config();

const OPERATOR_KEY = process.env.OPERATOR_PRIVATE_KEY || "";

module.exports = {
  solidity: "0.8.9",
  networks: {
    // Hela Chain (keep for backward compatibility)
    hela: {
      url: process.env.HELA_RPC_URL || "https://testnet-rpc.helachain.com",
      chainId: 666888,
      accounts: OPERATOR_KEY ? [OPERATOR_KEY] : [],
    },
    // Ethereum Testnets
    sepolia: {
      url: process.env.ETH_SEPOLIA_RPC || "https://rpc.ankr.com/eth_sepolia",
      chainId: 11155111,
      accounts: OPERATOR_KEY ? [OPERATOR_KEY] : [],
    },
    // Polygon Testnet
    mumbai: {
      url: process.env.POLYGON_MUMBAI_RPC || "https://rpc.ankr.com/polygon_mumbai",
      chainId: 80001,
      accounts: OPERATOR_KEY ? [OPERATOR_KEY] : [],
    },
    // BSC Testnet
    bsc_testnet: {
      url: process.env.BSC_TESTNET_RPC || "https://rpc.ankr.com/bsc_testnet",
      chainId: 97,
      accounts: OPERATOR_KEY ? [OPERATOR_KEY] : [],
    },
    // Base Testnet
    base_sepolia: {
      url: process.env.BASE_SEPOLIA_RPC || "https://rpc.ankr.com/base_sepolia",
      chainId: 84532,
      accounts: OPERATOR_KEY ? [OPERATOR_KEY] : [],
    },
    // Arbitrum Testnet
    arbitrum_sepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC || "https://rpc.ankr.com/arbitrum_sepolia",
      chainId: 421614,
      accounts: OPERATOR_KEY ? [OPERATOR_KEY] : [],
    },
    // Avalanche Testnet
    avalanche_fuji: {
      url: process.env.AVALANCHE_FUJI_RPC || "https://rpc.ankr.com/avalanche_fuji",
      chainId: 43113,
      accounts: OPERATOR_KEY ? [OPERATOR_KEY] : [],
    },
  },
};
