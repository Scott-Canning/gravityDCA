const { assert } = require("chai");
const { ethers } = require("hardhat");


describe("accumulatePurchaseOrders()", function () {
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
    const deposit4 = 4000;
    const interval4 = 7;
    const purchase4 = 1000
    const depositAmount4 = ethers.utils.parseUnits(deposit4.toString(), 18);
    const purchaseAmount4 = ethers.utils.parseUnits(purchase4.toString(), 18);

    // Signer 5 configuration inputs
    const deposit5 = 5000;
    const interval5 = 14;
    const purchase5 = 2500
    const depositAmount5 = ethers.utils.parseUnits(deposit5.toString(), 18);
    const purchaseAmount5 = ethers.utils.parseUnits(purchase5.toString(), 18);

    let contract, sourceToken, targetToken1, targetToken2, 
        signer1, signer2, signer3, signer4, signer5;

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

        // Deploy Strategy Factory contract
        const StrategyFactory = await ethers.getContractFactory("StrategyFactory");
        contract = await StrategyFactory.deploy(upKeepInterval);
        await contract.deployed();

        // Set source and target test tokens
        await contract.setSourceToken(sourceToken.address);
        await contract.setTargetToken(targetToken1.address);
        await contract.setTargetToken(targetToken2.address);

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
    
        // Signer 1 initiates strategy
        await sourceToken.approve(contract.address, depositAmount1);
        await contract.initiateNewStrategy(sourceToken.address,
                                            targetToken1.address,
                                            depositAmount1,
                                            interval1,
                                            purchaseAmount1);

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
                                                            targetToken1.address,
                                                            depositAmount5,
                                                            interval5,
                                                            purchaseAmount5);
    });

    // Only tests accumulatePurchaseOrders(), i.e., circumvents swapping and thus values should be equivalent
    it("Purchase orders for each slot should be equivalent to total deposits at each slot", async function () {
        for(let i = 0; i <= (interval5 * (depositAmount5 / purchaseAmount5)); i++) {
            let purchaseOrders = await contract.connect(signer1).getPurchaseOrderDetails(i);
            let targetToken1Total = 0;
            let targetToken2Total = 0;
            for(let j = 0; j < purchaseOrders.length; j++) {
                if(purchaseOrders[j].asset === targetToken1.address) {
                    targetToken1Total += parseInt(ethers.utils.formatUnits(purchaseOrders[j].amount));
                }
                else if (purchaseOrders[j].asset === targetToken2.address) {
                    targetToken2Total += parseInt(ethers.utils.formatUnits(purchaseOrders[j].amount));
                }
            }
            let accPurchaseOrder = await contract.connect(signer1).accumulatePurchaseOrders(i);
            assert.equal(parseInt(ethers.utils.formatUnits(accPurchaseOrder[1])), targetToken1Total);
            assert.equal(parseInt(ethers.utils.formatUnits(accPurchaseOrder[2])), targetToken2Total);
        }
    });

});