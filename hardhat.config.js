require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require('dotenv').config({path:__dirname+'/.env'})

module.exports = {
  solidity: "0.8.7",
  paths: {
    artifacts: "./app/artifacts",
  },
  defaultNetwork: "hardhat", 
  networks: {
    hardhat: {
      forking: {
        enabled: false,
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.KOVAN_URL}`,
  }
    },
    kovan: {
      url: process.env.KOVAN_URL,
      accounts: [process.env.PRIVATE_KEY],
    }
  },
  etherscan: {
    apiKey: {
      kovan: process.env.ETHERSCAN_KEY
    }
  },
};