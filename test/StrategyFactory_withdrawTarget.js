const { assert, expect } = require("chai");
const { ethers } = require("hardhat");


describe("withdrawTarget()", function () {
    const pairs = {}; // note: imperfect representation of nested map 'pairs' in StrategyFactory.sol (non-DCE)
    const reversePairs = [];
    const upKeepInterval = 120;
    // Signer 1 configuration inputs
    const deposit1_ETH = 10000;
    const interval1_ETH = 1;
    const purchase1_ETH = 2500;
    const depositAmount1_ETH = ethers.utils.parseUnits(deposit1_ETH.toString(), 18);
    const purchaseAmount1_ETH = ethers.utils.parseUnits(purchase1_ETH.toString(), 18);

    const deposit1_BTC = 10000;
    const interval1_BTC = 1;
    const purchase1_BTC = 2500;
    const depositAmount1_BTC = ethers.utils.parseUnits(deposit1_BTC.toString(), 18);
    const purchaseAmount1_BTC = ethers.utils.parseUnits(purchase1_BTC.toString(), 18);

    let strategyFactory, sourceToken, targetToken1, targetToken2, targetToken3, signer1;

    let AssetPrices = [0, 2000, 30000, 1]; // null, ETH, BTC, MATIC

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
        const pair1Id  = ethers.BigNumber.from(getPair1Tx).toNumber();
        pairs[targetToken1.address] = pair1Id;
        reversePairs[pair1Id] = targetToken1.address;

        await strategyFactory.setPair(sourceToken.address, targetToken2.address);
        const getPair2Tx = await strategyFactory.getPairId(sourceToken.address, targetToken2.address);
        const pair2Id = ethers.BigNumber.from(getPair2Tx).toNumber();
        pairs[targetToken2.address] = pair2Id;
        reversePairs[pair2Id] = targetToken2.address;

        // Get signer
        [ signer1 ] = await ethers.getSigners();

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

        // Send withdrawable target tokens to contract
        const transferAmount1 = ethers.utils.parseUnits((deposit1_ETH / AssetPrices[1]).toString(), 18);
        await targetToken1.transfer(strategyFactory.address, transferAmount1);

        const transferAmount2 = ethers.utils.parseUnits((deposit1_BTC / AssetPrices[2]).toString(), 18);
        await targetToken2.transfer(strategyFactory.address, transferAmount2);

        let blockNum = await ethers.provider.getBlockNumber();
        let block = await ethers.provider.getBlock(blockNum);
        let timestamp = block.timestamp;

        let endTimestamp = timestamp + (((deposit1_ETH / purchase1_ETH) * interval1_ETH + 2) * upKeepInterval);
        while(timestamp <= endTimestamp) {
            await strategyFactory.checkUpkeepTEST({gasLimit: 250_000});
            await ethers.provider.send('evm_increaseTime', [upKeepInterval]);
            await ethers.provider.send('evm_mine');
            blockNum = await ethers.provider.getBlockNumber();
            block = await ethers.provider.getBlock(blockNum);
            timestamp = block.timestamp;
        }

    });
    
    it("Function should revert on user attempt to withdraw amount exceeding their balance", async function () {
        const amount = ethers.utils.parseUnits((10001 / AssetPrices[1]).toString(), 18);
        const strategy = await strategyFactory.getStrategyDetails(signer1.address, pairs[targetToken1.address]);
        const targetBalance = strategy.targetBalance;
        assert.isTrue(amount > targetBalance);
        await expect(strategyFactory.withdrawTarget(pairs[targetToken1.address], amount))
                                             .to.be
                                             .revertedWith("Withdrawal amount exceeds target asset balance");
    });

    // Naive local test (send targetToken1 balance to contract for user to withdraw)
    it("Function should allow user to withdrawal full target asset balances", async function () {
        const amount = deposit1_ETH / AssetPrices[1];
        let strategyETH = await strategyFactory.getStrategyDetails(signer1.address, pairs[targetToken1.address]);
        let targetBalanceETH = parseFloat(ethers.utils.formatUnits(strategyETH.targetBalance, 18));
        assert.equal(amount, targetBalanceETH);

        const amountETH = ethers.utils.parseUnits((amount).toString(), 18);
        await strategyFactory.withdrawTarget(pairs[targetToken1.address], amountETH);
        strategyETH = await strategyFactory.getStrategyDetails(signer1.address, pairs[targetToken1.address]);
        targetBalanceETH = parseFloat(ethers.utils.formatUnits(strategyETH.targetBalance, 18));
        assert.equal(0, targetBalanceETH);
    });

    it("Function should emit event upon withdrawal", async function () {
        const amount = deposit1_BTC / AssetPrices[2];
        const amountBTC = ethers.utils.parseUnits((amount).toString(), 18);
        await expect(strategyFactory.withdrawTarget(pairs[targetToken2.address], amountBTC))
                                             .to.emit(strategyFactory, "Withdrawal")
                                             .withArgs(signer1.address, amountBTC);
    });

});