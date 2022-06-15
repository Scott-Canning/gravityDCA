const { assert } = require("chai");
const { ethers } = require("hardhat");


describe("Local Keepers Simulation", function () {
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

    let contract, sourceToken, targetToken1, targetToken2, targetToken3, 
        signer1, signer2, signer3, signer4, signer5;

    let AssetPrices = [2000, 30000, 1]; // null, ETH, BTC, MATIC

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
        contract = await StrategyFactory.deploy(upKeepInterval);
        await contract.deployed();

        // Set source and target test tokens
        await contract.setSourceToken(sourceToken.address);
        await contract.setTargetToken(targetToken1.address);
        await contract.setTargetToken(targetToken2.address);
        await contract.setTargetToken(targetToken3.address);

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
        await sourceToken.approve(contract.address, depositAmount1_ETH);
        await contract.initiateNewStrategy(sourceToken.address,
                                            targetToken1.address,
                                            depositAmount1_ETH,
                                            interval1_ETH,
                                            purchaseAmount1_ETH);

        // Signer 1 initiates BTC strategy
        await sourceToken.approve(contract.address, depositAmount1_BTC);
        await contract.initiateNewStrategy(sourceToken.address,
                                            targetToken2.address,
                                            depositAmount1_BTC,
                                            interval1_BTC,
                                            purchaseAmount1_BTC);

        // Signer 2 initiates strategy
        await sourceToken.connect(signer2).approve(contract.address, depositAmount2);
        await contract.connect(signer2).initiateNewStrategy(sourceToken.address,
                                                            targetToken2.address,
                                                            depositAmount2,
                                                            interval2,
                                                            purchaseAmount2);
        
        // Signer 3 initiates strategy
        await sourceToken.connect(signer3).approve(contract.address, depositAmount3);
        await contract.connect(signer3).initiateNewStrategy(sourceToken.address,
                                                            targetToken1.address,
                                                            depositAmount3,
                                                            interval3,
                                                            purchaseAmount3);

        // Signer 4 initiates strategy
        await sourceToken.connect(signer4).approve(contract.address, depositAmount4);
        await contract.connect(signer4).initiateNewStrategy(sourceToken.address,
                                                            targetToken2.address,
                                                            depositAmount4,
                                                            interval4,
                                                            purchaseAmount4);

        // Signer 5 initiates strategy
        await sourceToken.connect(signer5).approve(contract.address, depositAmount5);
        await contract.connect(signer5).initiateNewStrategy(sourceToken.address,
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
            await contract.checkUpkeepTEST();
            await ethers.provider.send('evm_increaseTime', [upKeepInterval]);
            await ethers.provider.send('evm_mine');
            blockNum = await ethers.provider.getBlockNumber();
            block = await ethers.provider.getBlock(blockNum);
            timestamp = block.timestamp;
        }

        // Expectation target balances
        let tgtBalSigner1_ETH = deposit1_ETH / AssetPrices[0];
        let tgtBalSigner1_BTC = deposit1_BTC / AssetPrices[1];
        let tgtBalSigner2_BTC = deposit2 / AssetPrices[1];
        let tgtBalSigner3_ETH = deposit3 / AssetPrices[0];
        let tgtBalSigner4_BTC = deposit4 / AssetPrices[1];
        let tgtBalSigner5_MATIC = deposit5 / AssetPrices[2];

        // Contract derived balances
        let stratSigner1_ETH = await contract.connect(signer1).getStrategyDetails(signer1.address, targetToken1.address);
        let stratSigner1_ETH_tgtBal = parseFloat(ethers.utils.formatUnits(stratSigner1_ETH.targetBalance, 18));

        let stratSigner1_BTC = await contract.connect(signer1).getStrategyDetails(signer1.address, targetToken2.address)
        let stratSigner1_BTC_tgtBal = parseFloat(ethers.utils.formatUnits(stratSigner1_BTC.targetBalance, 18));

        let stratSigner2_BTC = await contract.connect(signer2).getStrategyDetails(signer2.address, targetToken2.address)
        let stratSigner2_BTC_tgtBal = parseFloat(ethers.utils.formatUnits(stratSigner2_BTC.targetBalance, 18));

        let stratSigner3_ETH = await contract.connect(signer3).getStrategyDetails(signer3.address, targetToken1.address);
        let stratSigner3_ETH_tgtBal = parseFloat(ethers.utils.formatUnits(stratSigner3_ETH.targetBalance, 18));
    
        let stratSigner4_BTC = await contract.connect(signer4).getStrategyDetails(signer4.address, targetToken2.address)
        let stratSigner4_BTC_tgtBal = parseFloat(ethers.utils.formatUnits(stratSigner4_BTC.targetBalance, 18));

        let stratSigner5_MATIC = await contract.connect(signer5).getStrategyDetails(signer5.address, targetToken3.address)
        let stratSigner5_MATIC_tgtBal = parseFloat(ethers.utils.formatUnits(stratSigner5_MATIC.targetBalance, 18));

        assert.equal(tgtBalSigner1_ETH, stratSigner1_ETH_tgtBal);
        assert.equal(tgtBalSigner1_BTC, stratSigner1_BTC_tgtBal);
        assert.equal(tgtBalSigner2_BTC, stratSigner2_BTC_tgtBal);
        assert.equal(tgtBalSigner3_ETH, stratSigner3_ETH_tgtBal);
        assert.equal(tgtBalSigner4_BTC, stratSigner4_BTC_tgtBal);
        assert.equal(tgtBalSigner5_MATIC, stratSigner5_MATIC_tgtBal);
    });

});