// StrategyFactory_deploy.js
const hre = require("hardhat");
const { ethers } = require('ethers');
require('dotenv').config();

const upKeepIntervalPROD = 60 * 60 * 24; // 1 day
const upKeepIntervalTEST = 120; // 120 seconds

async function deploy() {
  const url = process.env.MUMBAI_URL;
  const provider = new ethers.providers.JsonRpcProvider(url);

  let privateKey = process.env.PRIVATE_KEY;
  let wallet = new ethers.Wallet(privateKey, provider);

  let artifacts = await hre.artifacts.readArtifact("StrategyFactory");
  let factory = new ethers.ContractFactory(artifacts.abi, artifacts.bytecode, wallet);
  let contract = await factory.deploy(upKeepIntervalTEST);

  console.log("Contract address:", contract.address);
  await contract.deployed();
}

deploy()
.then(() => process.exit(0))
.catch((error) => {
  console.error(error);
  process.exit(1);
});
