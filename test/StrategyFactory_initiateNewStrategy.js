const { assert, expect } = require("chai");
const { ethers } = require("hardhat");


describe("initNewStrategy()", function () {
    const pairs = {}; // note: imperfect representation of nested map 'pairs' in StrategyFactory.sol (non-DCE)
    const upKeepInterval = 120;
    // Signer 1 configuration inputs
    const deposit1 = 10000
    const interval1 = 1;
    const purchase1 = 2500
    const depositAmount1 = ethers.utils.parseUnits(deposit1.toString(), 18);
    const purchaseAmount1 = ethers.utils.parseUnits(purchase1.toString(), 18);

    // Signer 2 configuration inputs
    const deposit2 = 5000;
    const interval2 = 1;
    const purchase2 = 2500
    const depositAmount2 = ethers.utils.parseUnits(deposit2.toString(), 18);
    const purchaseAmount2 = ethers.utils.parseUnits(purchase2.toString(), 18);

    // Signer 3 configuration inputs
    const deposit3 = 5000;
    const interval3 = 1;
    const purchase3 = 2000
    const depositAmount3 = ethers.utils.parseUnits(deposit3.toString(), 18);
    const purchaseAmount3 = ethers.utils.parseUnits(purchase3.toString(), 18);

    // Signer 4 configuration inputs
    const deposit4 = 5000;
    const interval4 = 7;
    const purchase4 = 1000
    const depositAmount4 = ethers.utils.parseUnits(deposit4.toString(), 18);
    const purchaseAmount4 = ethers.utils.parseUnits(purchase4.toString(), 18);

    // Signer 5 configuration inputs
    const deposit5 = 5000;
    const interval5 = 11;
    const purchase5 = 1000
    const depositAmount5 = ethers.utils.parseUnits(deposit5.toString(), 18);
    const purchaseAmount5 = ethers.utils.parseUnits(purchase5.toString(), 18);

    let strategyFactory, sourceToken, targetToken1, targetToken2, targetToken3,
        signer1, signer2, signer3, signer4, signer5, pair1Id, pair2Id;
    
    before("Deploy testing tokens and StrategyFactory.sol", async function () { 
        // Deploy ERC20 source token
        const SourceToken = await ethers.getContractFactory("SourceToken");
        sourceToken = await SourceToken.deploy();
        await sourceToken.deployed();

        // Deploy ERC20 target token
        const TargetToken1 = await ethers.getContractFactory("TargetToken");
        targetToken1 = await TargetToken1.deploy();
        await targetToken1.deployed();

        // Deploy ERC20 target token 2
        const TargetToken2 = await ethers.getContractFactory("TargetToken");
        targetToken2 = await TargetToken2.deploy();
        await targetToken2.deployed();

        // Deploy ERC20 target token 3
        const TargetToken3 = await ethers.getContractFactory("TargetToken");
        targetToken3 = await TargetToken3.deploy();
        await targetToken3.deployed();
        
        // Deploy Strategy Factory strategyFactory
        const StrategyFactory = await ethers.getContractFactory("StrategyFactory");
        strategyFactory = await StrategyFactory.deploy(upKeepInterval);
        await strategyFactory.deployed();

        // Set pairs
        await strategyFactory.setPair(sourceToken.address, targetToken1.address);
        const getPair1Tx = await strategyFactory.getPairId(sourceToken.address, targetToken1.address);
        pair1Id = ethers.BigNumber.from(getPair1Tx).toNumber();
        pairs[targetToken1.address] = pair1Id;

        await strategyFactory.setPair(sourceToken.address, targetToken2.address);
        const getPair2Tx = await strategyFactory.getPairId(sourceToken.address, targetToken2.address);
        pair2Id = ethers.BigNumber.from(getPair2Tx).toNumber();
        pairs[targetToken2.address] = pair2Id;

        // Get signers and send source token to other signers
        [ signer1, signer2, signer3, signer4, signer5 ] = await ethers.getSigners();        
        const transferAmount1 = ethers.utils.parseUnits("5000", 18);
        await sourceToken.transfer(signer2.address, transferAmount1);

        const transferAmount2 = ethers.utils.parseUnits("5000", 18);
        await sourceToken.transfer(signer3.address, transferAmount2);

        const transferAmount3 = ethers.utils.parseUnits("5000", 18);
        await sourceToken.transfer(signer4.address, transferAmount3);

        const transferAmount4 = ethers.utils.parseUnits("5000", 18);
        await sourceToken.transfer(signer5.address, transferAmount4);
    });

    it("Contract should have source token balance equivalent to amounts deposited for strategy initiations", async function () {
        // Signer 1 initiates strategy
        await sourceToken.approve(strategyFactory.address, depositAmount1);
        await strategyFactory.initiateNewStrategy(sourceToken.address,
                                                  targetToken1.address,
                                                  depositAmount1,
                                                  interval1,
                                                  purchaseAmount1);

        // Signer 2 initiates strategy
        await sourceToken.connect(signer2).approve(strategyFactory.address, depositAmount2);
        await strategyFactory.connect(signer2).initiateNewStrategy(sourceToken.address,
                                                                   targetToken1.address,
                                                                   depositAmount2,
                                                                   interval2,
                                                                   purchaseAmount2);

        const contractBalance = await sourceToken.balanceOf(strategyFactory.address);
        const totalDeposits = (deposit1 + deposit2);
        assert.equal(ethers.utils.formatUnits(contractBalance, 18), totalDeposits);
    });

    it("Function should correctly populate purchase orders after user initiates strategy", async function () {
        for(let i = 1; i <= (deposit1 / purchase1); i++) {
            let purchaseOrders = await strategyFactory.getPurchaseOrderDetails(i, pair1Id);
            for(let j = 0; j < purchaseOrders.length; j++) {
                if(purchaseOrders[j].user === signer1.address) {
                    let pairId = ethers.BigNumber.from(purchaseOrders[j].pairId).toNumber();
                    let amount = parseInt(ethers.utils.formatUnits(purchaseOrders[j].amount, 18));
                    assert.equal(pairs[targetToken1.address], pairId);
                    assert.equal(amount, purchase1);
                }
            }
        }
    });

    it("Function should revert on user attempt to overwrite existing strategy", async function () {
        await sourceToken.approve(strategyFactory.address, depositAmount1);
        await expect(strategyFactory.initiateNewStrategy(sourceToken.address,
                                                         targetToken1.address,
                                                         depositAmount1,
                                                         interval1,
                                                         purchaseAmount1))
                                                         .to.be
                                                         .revertedWith("Existing strategy");
    });

    it("Function should increment purchasesRemaining for sourceBalance deposit amount with remainder over purchase amount divisor", async function () {
        await sourceToken.connect(signer3).approve(strategyFactory.address, depositAmount3);
        await strategyFactory.connect(signer3).initiateNewStrategy(sourceToken.address,
                                                                   targetToken1.address,
                                                                   depositAmount3,
                                                                   interval3,
                                                                   purchaseAmount3);

        const expectedPurchasesRemaining = Math.round(depositAmount3 / purchaseAmount3)
        const strategy = await strategyFactory.getStrategyDetails(signer3.address, pairs[targetToken1.address]);
        const purchasesRemaining = ethers.BigNumber.from(strategy.purchasesRemaining).toNumber();
        assert.equal(expectedPurchasesRemaining, purchasesRemaining);
    });

    it("Function should emit event on newly initiated strategy", async function () {
        const purchaseSlot = await strategyFactory.purchaseSlot();
        const slot = parseInt(purchaseSlot) + interval4;
        await sourceToken.connect(signer4).approve(strategyFactory.address, depositAmount4);
        await expect(strategyFactory.connect(signer4).initiateNewStrategy(sourceToken.address,
                                                                          targetToken1.address,
                                                                          depositAmount4,
                                                                          interval4,
                                                                          purchaseAmount4))
                                                                          .to.emit(strategyFactory, "StrategyInitiated")
                                                                          .withArgs(signer4.address, slot);
    });

    it("Function should revert on attempt to initate new strategy with insufficient funds", async function () {
        await sourceToken.connect(signer4).approve(strategyFactory.address, depositAmount4);
        await expect(strategyFactory.connect(signer4).initiateNewStrategy(sourceToken.address,
                                                                          targetToken2.address,
                                                                          depositAmount4,
                                                                          interval4,
                                                                          purchaseAmount4))
                                                                          .to.be
                                                                          .revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Function should revert on attempt to initate new strategy with arbitrary interval", async function () {
        await sourceToken.connect(signer5).approve(strategyFactory.address, depositAmount5);
        await expect(strategyFactory.connect(signer5).initiateNewStrategy(sourceToken.address,
                                                                          targetToken1.address,
                                                                          depositAmount5,
                                                                          interval5,
                                                                          purchaseAmount5))
                                                                          .to.be
                                                                          .revertedWith("Unsupported interval");
    });

    it("Function should revert on attempt to initate new strategy with non existing pairId", async function () {
        await sourceToken.connect(signer5).approve(strategyFactory.address, depositAmount5);
        await expect(strategyFactory.connect(signer5).initiateNewStrategy(sourceToken.address,
                                                                          targetToken3.address,
                                                                          depositAmount5,
                                                                          interval5,
                                                                          purchaseAmount5))
                                                                          .to.be
                                                                          .revertedWith("Pair does not exist");
    });

});