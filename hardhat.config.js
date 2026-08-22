require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-ignition-ethers");
require("dotenv").config();

const OPERATOR_KEY = process.env.OPERATOR_PRIVATE_KEY || "";

module.exports = {
  solidity: "0.8.9",
  networks: {
    hela: {
      url: process.env.HELA_RPC_URL || "https://testnet-rpc.helachain.com",
      chainId: 666888,
      accounts: OPERATOR_KEY ? [OPERATOR_KEY] : [],
    },
  },
};
