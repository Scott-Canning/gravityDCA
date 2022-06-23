const { assert } = require("chai");
const { ethers } = require("hardhat");


describe("Local Upkeep Simulation", function () {
    const pairs = {}; // note: imperfect representation of nested map 'pairs' in StrategyFactory.sol (non-DCE)
    const reversePairs = [];
    const upKeepInterval = 120;
    // Signer 1 configuration inputs
    const deposit1_ETH = 10000;
    const interval1_ETH = 1;
    const purchase1_ETH = 2500;
    const depositAmount1_ETH = ethers.utils.parseUnits(deposit1_ETH.toString(), 18);
    const purchaseAmount1_ETH = ethers.utils.parseUnits(purchase1_ETH.toString(), 18);

    const deposit1_BTC = 7500;
    const interval1_BTC = 7;
    const purchase1_BTC = 2500;
    const depositAmount1_BTC = ethers.utils.parseUnits(deposit1_BTC.toString(), 18);
    const purchaseAmount1_BTC = ethers.utils.parseUnits(purchase1_BTC.toString(), 18);

    // Signer 2 configuration inputs
    const deposit2 = 5000;
    const interval2 = 1;
    const purchase2 = 2500;
    const depositAmount2 = ethers.utils.parseUnits(deposit2.toString(), 18);
    const purchaseAmount2 = ethers.utils.parseUnits(purchase2.toString(), 18);

    // Signer 3 configuration inputs
    const deposit3 = 5000;
    const interval3 = 1;
    const purchase3 = 2000;
    const depositAmount3 = ethers.utils.parseUnits(deposit3.toString(), 18);
    const purchaseAmount3 = ethers.utils.parseUnits(purchase3.toString(), 18);

    // Signer 4 configuration inputs
    const deposit4 = 4000;
    const interval4 = 7;
    const purchase4 = 1000;
    const depositAmount4 = ethers.utils.parseUnits(deposit4.toString(), 18);
    const purchaseAmount4 = ethers.utils.parseUnits(purchase4.toString(), 18);

    // Signer 5 configuration inputs
    const deposit5 = 5000;
    const interval5 = 14;
    const purchase5 = 2500;
    const depositAmount5 = ethers.utils.parseUnits(deposit5.toString(), 18);
    const purchaseAmount5 = ethers.utils.parseUnits(purchase5.toString(), 18);

    let strategyFactory, sourceToken, targetToken1, targetToken2, targetToken3, 
        signer1, signer2, signer3, signer4, signer5;

    let AssetPrices = [0, 2000, 30000, 1]; // null, "ETH", "BTC", "MATIC"

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

        // Deploy Strategy Factory strategyFactory
        const StrategyFactory = await ethers.getContractFactory("StrategyFactory");
        strategyFactory = await StrategyFactory.deploy(upKeepInterval);
        await strategyFactory.deployed();

        // Set pairs
        await strategyFactory.setPair(sourceToken.address, targetToken1.address);
        const getPair1Tx = await strategyFactory.getPairId(sourceToken.address, targetToken1.address);
        const pair1Id  = ethers.BigNumber.from(getPair1Tx).toNumber();
        pairs[targetToken1.address] = pair1Id;
        reversePairs[pair1Id] = targetToken1.address;

        await strategyFactory.setPair(sourceToken.address, targetToken2.address);
        const getPair2Tx = await strategyFactory.getPairId(sourceToken.address, targetToken2.address);
        const pair2Id = ethers.BigNumber.from(getPair2Tx).toNumber();
        pairs[targetToken2.address] = pair2Id;
        reversePairs[pair2Id] = targetToken2.address;

        await strategyFactory.setPair(sourceToken.address, targetToken3.address);
        const getPair3Tx = await strategyFactory.getPairId(sourceToken.address, targetToken3.address);
        const pair3Id = ethers.BigNumber.from(getPair3Tx).toNumber();
        pairs[targetToken3.address] = pair3Id;
        reversePairs[pair3Id] = targetToken3.address;

        // Get signers and send source token to signers 2 and 3
        [signer1, signer2, signer3, signer4, signer5] = await ethers.getSigners();
        const transferAmount1 = ethers.utils.parseUnits("5000", 18);
        await sourceToken.transfer(signer2.address, transferAmount1);

        const transferAmount2 = ethers.utils.parseUnits("5000", 18);
        await sourceToken.transfer(signer3.address, transferAmount2);

        const transferAmount3 = ethers.utils.parseUnits("5000", 18);
        await sourceToken.transfer(signer4.address, transferAmount3);

        const transferAmount4 = ethers.utils.parseUnits("5000", 18);
        await sourceToken.transfer(signer5.address, transferAmount4);
    
        // Signer 1 initiates ETH strategy
        await sourceToken.approve(strategyFactory.address, depositAmount1_ETH);
        await strategyFactory.initiateNewStrategy(sourceToken.address,
                                            targetToken1.address,
                                            depositAmount1_ETH,
                                            interval1_ETH,
                                            purchaseAmount1_ETH);

        // Signer 1 initiates BTC strategy
        await sourceToken.approve(strategyFactory.address, depositAmount1_BTC);
        await strategyFactory.initiateNewStrategy(sourceToken.address,
                                            targetToken2.address,
                                            depositAmount1_BTC,
                                            interval1_BTC,
                                            purchaseAmount1_BTC);

        // Signer 2 initiates strategy
        await sourceToken.connect(signer2).approve(strategyFactory.address, depositAmount2);
        await strategyFactory.connect(signer2).initiateNewStrategy(sourceToken.address,
                                                            targetToken2.address,
                                                            depositAmount2,
                                                            interval2,
                                                            purchaseAmount2);
        
        // Signer 3 initiates strategy
        await sourceToken.connect(signer3).approve(strategyFactory.address, depositAmount3);
        await strategyFactory.connect(signer3).initiateNewStrategy(sourceToken.address,
                                                            targetToken1.address,
                                                            depositAmount3,
                                                            interval3,
                                                            purchaseAmount3);

        // Signer 4 initiates strategy
        await sourceToken.connect(signer4).approve(strategyFactory.address, depositAmount4);
        await strategyFactory.connect(signer4).initiateNewStrategy(sourceToken.address,
                                                            targetToken2.address,
                                                            depositAmount4,
                                                            interval4,
                                                            purchaseAmount4);

        // Signer 5 initiates strategy
        await sourceToken.connect(signer5).approve(strategyFactory.address, depositAmount5);
        await strategyFactory.connect(signer5).initiateNewStrategy(sourceToken.address,
                                                            targetToken3.address,
                                                            depositAmount5,
                                                            interval5,
                                                            purchaseAmount5);
    });

    it("Simulated strategy initiations for multiple user strategies purchasing different tokens should produce deterministic target balances", async function () {
        let blockNum = await ethers.provider.getBlockNumber();
        let block = await ethers.provider.getBlock(blockNum);
        let timestamp = block.timestamp;

        let endTimestamp = timestamp + (((depositAmount5 / purchaseAmount5) * interval5 + 2) * upKeepInterval);
        while(timestamp <= endTimestamp) {
            await strategyFactory.checkUpkeepTEST({gasLimit: 1_250_000});
            await ethers.provider.send('evm_increaseTime', [upKeepInterval]);
            await ethers.provider.send('evm_mine');
            blockNum = await ethers.provider.getBlockNumber();
            block = await ethers.provider.getBlock(blockNum);
            timestamp = block.timestamp;
        }

        // Expectation target balances
        let tgtBalSigner1_ETH = deposit1_ETH / AssetPrices[1];
        let tgtBalSigner1_BTC = deposit1_BTC / AssetPrices[2];
        let tgtBalSigner2_BTC = deposit2 / AssetPrices[2];
        let tgtBalSigner3_ETH = deposit3 / AssetPrices[1];
        let tgtBalSigner4_BTC = deposit4 / AssetPrices[2];
        let tgtBalSigner5_MATIC = deposit5 / AssetPrices[3];

        // Contract derived balances
        let stratSigner1_ETH = await strategyFactory.connect(signer1).getStrategyDetails(signer1.address, pairs[targetToken1.address]);
        let stratSigner1_ETH_tgtBal = parseFloat(ethers.utils.formatUnits(stratSigner1_ETH.targetBalance, 18));

        let stratSigner1_BTC = await strategyFactory.connect(signer1).getStrategyDetails(signer1.address, pairs[targetToken2.address])
        let stratSigner1_BTC_tgtBal = parseFloat(ethers.utils.formatUnits(stratSigner1_BTC.targetBalance, 18));

        let stratSigner2_BTC = await strategyFactory.connect(signer2).getStrategyDetails(signer2.address, pairs[targetToken2.address])
        let stratSigner2_BTC_tgtBal = parseFloat(ethers.utils.formatUnits(stratSigner2_BTC.targetBalance, 18));

        let stratSigner3_ETH = await strategyFactory.connect(signer3).getStrategyDetails(signer3.address, pairs[targetToken1.address]);
        let stratSigner3_ETH_tgtBal = parseFloat(ethers.utils.formatUnits(stratSigner3_ETH.targetBalance, 18));
    
        let stratSigner4_BTC = await strategyFactory.connect(signer4).getStrategyDetails(signer4.address, pairs[targetToken2.address])
        let stratSigner4_BTC_tgtBal = parseFloat(ethers.utils.formatUnits(stratSigner4_BTC.targetBalance, 18));

        let stratSigner5_MATIC = await strategyFactory.connect(signer5).getStrategyDetails(signer5.address, pairs[targetToken3.address])
        let stratSigner5_MATIC_tgtBal = parseFloat(ethers.utils.formatUnits(stratSigner5_MATIC.targetBalance, 18));

        assert.equal(tgtBalSigner1_ETH, stratSigner1_ETH_tgtBal);
        assert.equal(tgtBalSigner1_BTC, stratSigner1_BTC_tgtBal);
        assert.equal(tgtBalSigner2_BTC, stratSigner2_BTC_tgtBal);
        assert.equal(tgtBalSigner3_ETH, stratSigner3_ETH_tgtBal);
        assert.equal(tgtBalSigner4_BTC, stratSigner4_BTC_tgtBal);
        assert.equal(tgtBalSigner5_MATIC, stratSigner5_MATIC_tgtBal);
    });

});