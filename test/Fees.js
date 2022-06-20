// const { assert, expect } = require("chai");
// const { ethers } = require("hardhat");


// describe("Fees", function () {
//     const upKeepInterval = 120;
//     // Signer 1 configuration inputs
//     const deposit1 = 10000
//     const interval1 = 1;
//     const purchase1 = 2500
//     const depositAmount1 = ethers.utils.parseUnits(deposit1.toString(), 18);
//     const purchaseAmount1 = ethers.utils.parseUnits(purchase1.toString(), 18);

//     // Signer 2 configuration inputs
//     const deposit2 = 5000;
//     const interval2 = 1;
//     const purchase2 = 2500
//     const depositAmount2 = ethers.utils.parseUnits(deposit2.toString(), 18);
//     const purchaseAmount2 = ethers.utils.parseUnits(purchase2.toString(), 18);

//     // Signer 3 configuration inputs
//     const deposit3 = 5000;
//     const interval3 = 1;
//     const purchase3 = 2000
//     const depositAmount3 = ethers.utils.parseUnits(deposit3.toString(), 18);
//     const purchaseAmount3 = ethers.utils.parseUnits(purchase3.toString(), 18);

//     // Signer 4 configuration inputs
//     const deposit4 = 5000;
//     const interval4 = 7;
//     const purchase4 = 1000
//     const depositAmount4 = ethers.utils.parseUnits(deposit4.toString(), 18);
//     const purchaseAmount4 = ethers.utils.parseUnits(purchase4.toString(), 18);

//     // Signer 5 configuration inputs
//     const deposit5 = 5000;
//     const interval5 = 11;
//     const purchase5 = 1000
//     const depositAmount5 = ethers.utils.parseUnits(deposit5.toString(), 18);
//     const purchaseAmount5 = ethers.utils.parseUnits(purchase5.toString(), 18);

//     let contract, sourceToken, targetToken, 
//         signer1, signer2, signer3, signer4, signer5;

//     before("Deploy testing tokens and StrategyFactory.sol", async function () { 
//         // Deploy ERC20 source token
//         const SourceToken = await ethers.getContractFactory("SourceToken");
//         sourceToken = await SourceToken.deploy();
//         await sourceToken.deployed();

//         // Deploy ERC20 target token
//         const TargetToken = await ethers.getContractFactory("TargetToken");
//         targetToken = await TargetToken.deploy();
//         await targetToken.deployed();

//         // Deploy Strategy Factory contract
//         const StrategyFactory = await ethers.getContractFactory("StrategyFactory");
//         contract = await StrategyFactory.deploy(upKeepInterval);
//         await contract.deployed();

//         // Set source and target test tokens
//         await contract.setSourceToken(sourceToken.address);
//         await contract.setTargetToken(targetToken.address);

//         // Get signers and send source token to signers 2-5
//         [signer1, signer2, signer3, signer4, signer5] = await ethers.getSigners();
//         const transferAmount1 = ethers.utils.parseUnits("5000", 18);
//         await sourceToken.transfer(signer2.address, transferAmount1);

//         const transferAmount2 = ethers.utils.parseUnits("5000", 18);
//         await sourceToken.transfer(signer3.address, transferAmount2);

//         const transferAmount3 = ethers.utils.parseUnits("5000", 18);
//         await sourceToken.transfer(signer4.address, transferAmount3);

//         const transferAmount4 = ethers.utils.parseUnits("5000", 18);
//         await sourceToken.transfer(signer5.address, transferAmount4);
//     });

//     it("Fee testing", async function () {
//         const denominator = ethers.utils.parseUnits("1000", 18);
//         const numerator = ethers.utils.parseUnits("5", 18);
//         console.log(numerator / denominator);

//         await contract
//     });
        
// });
