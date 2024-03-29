const { assert, expect } = require("chai");
const { ethers } = require("hardhat");


describe("StrategyFactory.sol: topUpStrategy()", function () {
    const pairs = {}; // note: imperfect representation of nested map 'pairs' in StrategyFactory.sol (non-DCE)
    const reversePairs = []; // 
    const upKeepInterval = 120;
    // Signer 1 configuration inputs
    const deposit1_ETH = 10000
    const interval1_ETH = 1;
    const purchase1_ETH = 2500;
    const topUp1_ETH = 5000;
    const depositAmount1_ETH = ethers.utils.parseUnits(deposit1_ETH.toString(), 18);
    const purchaseAmount1_ETH = ethers.utils.parseUnits(purchase1_ETH.toString(), 18);
    const topUpAmount1_ETH = ethers.utils.parseUnits(topUp1_ETH.toString(), 18);

    // Signer 2 configuration inputs
    const deposit2 = 5000;
    const interval2 = 1;
    const purchase2 = 2500;
    const topUp2 = 5000;
    const depositAmount2 = ethers.utils.parseUnits(deposit2.toString(), 18);
    const purchaseAmount2 = ethers.utils.parseUnits(purchase2.toString(), 18);
    const topUpAmount2 = ethers.utils.parseUnits(topUp2.toString(), 18);

    // Signer 3 configuration inputs
    const deposit3 = 5000;
    const interval3 = 1;
    const purchase3 = 2000;
    const topUp3 = 5000;
    const depositAmount3 = ethers.utils.parseUnits(deposit3.toString(), 18);
    const purchaseAmount3 = ethers.utils.parseUnits(purchase3.toString(), 18);
    const topUpAmount3 = ethers.utils.parseUnits(topUp3.toString(), 18);

    // Signer 4 configuration inputs
    const deposit4 = 5000;
    const interval4 = 7;
    const purchase4 = 1000;
    const topUp4 = 2500;
    const depositAmount4 = ethers.utils.parseUnits(deposit4.toString(), 18);
    const purchaseAmount4 = ethers.utils.parseUnits(purchase4.toString(), 18);
    const topUpAmount4 = ethers.utils.parseUnits(topUp4.toString(), 18);

    let strategyFactory, sourceToken, targetToken1, targetToken2, targetToken3,
        signer1, signer2, signer3, signer4, pair1Id, pair2Id;

    before("Deploy testing tokens and StrategyFactory.sol", async function () { 
        // Deploy ERC20 source token
        const SourceToken = await ethers.getContractFactory("SourceToken");
        sourceToken = await SourceToken.deploy();
        await sourceToken.deployed();

        // Deploy ERC20 target token 1
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

        // Deploy Strategy Factory contract
        const StrategyFactory = await ethers.getContractFactory("StrategyFactory");
        strategyFactory = await StrategyFactory.deploy(upKeepInterval);
        await strategyFactory.deployed();

        // Set pairs
        await strategyFactory.setPair(sourceToken.address, targetToken1.address);
        const getPair1Tx = await strategyFactory.getPairId(sourceToken.address, targetToken1.address);
        pair1Id = ethers.BigNumber.from(getPair1Tx).toNumber();
        pairs[targetToken1.address] = pair1Id;
        reversePairs[pair1Id] = targetToken1.address;

        await strategyFactory.setPair(sourceToken.address, targetToken2.address);
        const getPair2Tx = await strategyFactory.getPairId(sourceToken.address, targetToken2.address);
        pair2Id = ethers.BigNumber.from(getPair2Tx).toNumber();
        pairs[targetToken2.address] = pair2Id;
        reversePairs[pair2Id] = targetToken2.address;

        // Get signers and send source token to other signers
        [ signer1, signer2, signer3, signer4 ] = await ethers.getSigners();
        const transferAmount1 = ethers.utils.parseUnits((deposit2 + topUp2).toString(), 18);
        await sourceToken.transfer(signer2.address, transferAmount1);

        const transferAmount2 = ethers.utils.parseUnits((deposit3 + topUp3).toString(), 18);
        await sourceToken.transfer(signer3.address, transferAmount2);

        const transferAmount3 = ethers.utils.parseUnits((deposit4 + topUp4).toString(), 18);
        await sourceToken.transfer(signer4.address, transferAmount3);
    });
    
    it("Contract should have source token balance equivalent to amounts deposited for strategy initiations and top ups", async function () {
        // Signer 1 initiates ETH strategy
        await sourceToken.approve(strategyFactory.address, depositAmount1_ETH);
        await strategyFactory.initiateNewStrategy(sourceToken.address,
                                                    targetToken1.address,
                                                    depositAmount1_ETH,
                                                    interval1_ETH,
                                                    purchaseAmount1_ETH);

        // Signer 1 topsUp ETH strategy
        await sourceToken.approve(strategyFactory.address, topUpAmount1_ETH);
        await strategyFactory.topUpStrategy(sourceToken.address,
                                            targetToken1.address,
                                            topUpAmount1_ETH);             
                                     
        // Signer 2 initiates strategy
        await sourceToken.connect(signer2).approve(strategyFactory.address, depositAmount2);
        await strategyFactory.connect(signer2).initiateNewStrategy(sourceToken.address,
                                                                    targetToken1.address,
                                                                    depositAmount2,
                                                                    interval2,
                                                                    purchaseAmount2);

        // Signer 2 topsUp strategy
        await sourceToken.connect(signer2).approve(strategyFactory.address, topUpAmount2);
        await strategyFactory.connect(signer2).topUpStrategy(sourceToken.address,
                                                            targetToken1.address,
                                                            topUpAmount2);

        const contractBalance = await sourceToken.balanceOf(strategyFactory.address);
        const totalDeposits = (deposit1_ETH + topUp1_ETH + deposit2 + topUp2);
        assert.equal(ethers.utils.formatUnits(contractBalance, 18), totalDeposits);
    });

    it("Function should correctly populate purchase orders after user tops up existing strategy", async function () {
        // Assumes user had a single strategy
        for(let i = 0; i < ((deposit1_ETH + topUp1_ETH) / purchase1_ETH); i++) {
            let purchaseOrders = await strategyFactory.getPurchaseOrderDetails(i, pairs[targetToken1.address]);
            for(let j = 0; j < purchaseOrders.length; j++) {
                if(purchaseOrders[j].user === signer1.address) {
                    let _targetAsset = reversePairs[purchaseOrders[j].pairId];
                    let amount = parseInt(ethers.utils.formatUnits(purchaseOrders[j].amount, 18));
                    assert.equal(targetToken1.address, _targetAsset);
                    assert.equal(amount, purchase1_ETH);
                }
            }
        }
    });

    it("Function should revert on user attempt to top up non-existing strategy", async function () {
        // Signer 1 attemps to top up non-existing strategy for targetToken2
        await sourceToken.connect(signer1).approve(strategyFactory.address, topUp1_ETH);
        await expect(strategyFactory.connect(signer1).topUpStrategy(sourceToken.address,
                                                                    targetToken2.address,
                                                                    topUp1_ETH))
                                                                    .to.be
                                                                    .revertedWith("No existing strategy");
    });

    it("Function should increment purchasesRemaining for sourceBalance deposit amount with remainder over purchase amount divisor", async function () {
        // Signer 3 initiates strategy in targetToken1
        await sourceToken.connect(signer3).approve(strategyFactory.address, depositAmount3);
        await strategyFactory.connect(signer3).initiateNewStrategy(sourceToken.address,
                                                            targetToken1.address,
                                                            depositAmount3,
                                                            interval3,
                                                            purchaseAmount3)

        // Signer 3 topsUp strategy
        await sourceToken.connect(signer3).approve(strategyFactory.address, topUpAmount3);
        await strategyFactory.connect(signer3).topUpStrategy(sourceToken.address,
                                                      targetToken1.address,
                                                      topUpAmount3);

        const expectedPurchasesRemaining = Math.round((deposit3 + topUp3) / purchase3)
        const strategy = await strategyFactory.getStrategyDetails(signer3.address, pairs[targetToken1.address]);
        const purchasesRemaining = ethers.BigNumber.from(strategy.purchasesRemaining).toNumber();
        assert.equal(expectedPurchasesRemaining, purchasesRemaining);
    });

    it("Function should emit event on topped up strategy", async function () {           
        // Signer 4 initiates strategy in targetToken1
        await sourceToken.connect(signer4).approve(strategyFactory.address, depositAmount4);
        await strategyFactory.connect(signer4).initiateNewStrategy(sourceToken.address,
                                                                    targetToken1.address,
                                                                    depositAmount4,
                                                                    interval4,
                                                                    purchaseAmount4);
        
        // Signer 4 topsUp strategy
        await sourceToken.connect(signer4).approve(strategyFactory.address, topUpAmount4);
        await expect(strategyFactory.connect(signer4).topUpStrategy(sourceToken.address,
                                                                    targetToken1.address,
                                                                    topUpAmount4))
                                                                    .to.emit(strategyFactory, "StrategyToppedUp")
                                                                    .withArgs(signer4.address, topUpAmount4);
    });

    it("Function should correctly update strategy's purchases remaining", async function () {
        const strategy = await strategyFactory.getStrategyDetails(signer4.address, pairs[targetToken1.address]);
        const purchasesRemaining = ethers.BigNumber.from(strategy.purchasesRemaining).toNumber()
        const expectedPurchasesRemaining = Math.round((deposit4 + topUp4) / purchase4);;
        assert.equal(expectedPurchasesRemaining, purchasesRemaining);
    });

    it("Function should revert on attempt to top up strategy with insufficient funds", async function () {
        await sourceToken.connect(signer4).approve(strategyFactory.address, topUpAmount4);
        await expect(strategyFactory.connect(signer4).topUpStrategy(sourceToken.address,
                                                                    targetToken1.address,
                                                                    topUpAmount4))
                                                                    .to.be
                                                                    .revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Function should revert on attempt to top up strategy with non existing pairId", async function () {
        await sourceToken.connect(signer1).approve(strategyFactory.address, topUpAmount1_ETH);
        await expect(strategyFactory.connect(signer1).initiateNewStrategy(sourceToken.address,
                                                                          targetToken3.address,
                                                                          topUpAmount1_ETH,
                                                                          interval1_ETH,
                                                                          purchaseAmount1_ETH))
                                                                          .to.be
                                                                          .revertedWith("Pair does not exist");
    });

});