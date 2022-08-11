const { assert, expect } = require("chai");
const { ethers } = require("hardhat");


describe("StrategyFactory.sol: initNewStrategy()", function () {
    const pairs = {}; // note: imperfect representation of nested map 'pairs' in StrategyFactory.sol (non-DCE)
    const upKeepInterval = 120;
    // Signer 1 configuration inputs
    const deposit1 = 11000
    const interval1 = 1;
    const purchase1 = 2500
    const depositAmount1 = ethers.utils.parseUnits(deposit1.toString(), 18);
    const purchaseAmount1 = ethers.utils.parseUnits(purchase1.toString(), 18);

    let strategyFactory, sourceToken, targetToken1, signer1, pair1Id;
    
    before("Deploy testing tokens and StrategyFactory.sol", async function () { 
        // Deploy ERC20 source token
        const SourceToken = await ethers.getContractFactory("SourceToken");
        sourceToken = await SourceToken.deploy();
        await sourceToken.deployed();

        // Deploy ERC20 target token
        const TargetToken1 = await ethers.getContractFactory("TargetToken");
        targetToken1 = await TargetToken1.deploy();
        await targetToken1.deployed();

        // Deploy Strategy Factory strategyFactory
        const StrategyFactory = await ethers.getContractFactory("StrategyFactory");
        strategyFactory = await StrategyFactory.deploy(upKeepInterval);
        await strategyFactory.deployed();

        // Set pairs
        await strategyFactory.setPair(sourceToken.address, targetToken1.address);
        const getPair1Tx = await strategyFactory.getPairId(sourceToken.address, targetToken1.address);
        pair1Id = ethers.BigNumber.from(getPair1Tx).toNumber();
        pairs[targetToken1.address] = pair1Id;

        // Get signers and send source token to other signers
        [ signer1 ] = await ethers.getSigners();        

        // Signer 1 initiates strategy
        await sourceToken.approve(strategyFactory.address, depositAmount1);
        await strategyFactory.initiateNewStrategy(sourceToken.address,
                                                    targetToken1.address,
                                                    depositAmount1,
                                                    interval1,
                                                    purchaseAmount1);
    });

    it("Function should return an accurate schedule for user's strategy of the passed pairId", async function () {
        const purchaseSchedule = await strategyFactory.getPurchaseSchedule(signer1.address, pair1Id);
        const [ purchaseSlots, purchaseAmounts ] = purchaseSchedule;

        const expPurchaseSlots = [];
        const expPurchaseCount = Math.ceil(deposit1 / purchase1);
        for(let i = 0; i < expPurchaseCount; i++) {
            expPurchaseSlots[i] = i + 1;
        }
        
        const remainder = deposit1 % purchase1;
        for(let i = 0; i < expPurchaseCount; i++) {
            const slot = ethers.BigNumber.from(purchaseSlots[i]).toNumber();
            assert.equal(slot, expPurchaseSlots[i]);

            const amount = ethers.utils.formatUnits(purchaseAmounts[i], 18);
            if(remainder > 0 && (i === expPurchaseCount - 1)) {
                assert.equal(amount, remainder);
            } else {
                assert.equal(amount, purchase1);
            }
        }
    });

});