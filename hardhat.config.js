require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-gas-reporter");
require("solidity-docgen");
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
        enabled: true,
        url: `${process.env.POLYGON_URL}`,
        //blockNumber: 26487456,
       },
    },
    kovan: {
      url: process.env.KOVAN_URL,
      accounts: [process.env.PRIVATE_KEY],
    },
    mumbai: {
      url: process.env.MUMBAI_URL,
      accounts: [process.env.PRIVATE_KEY],
    }
  },
  etherscan: {
    apiKey: process.env.POLYGONSCAN_KEY,
    // kovan: process.env.ETHERSCAN_KEY,
  },
};