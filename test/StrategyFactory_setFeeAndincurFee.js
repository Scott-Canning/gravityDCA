const { assert, expect } = require("chai");
const { ethers } = require("hardhat");


async function getBlockTimestamp() {
    let blockNum = await ethers.provider.getBlockNumber();
    let block = await ethers.provider.getBlock(blockNum);
    return block.timestamp;
}

describe("setFee() and incurFee()", function () {
    const upKeepInterval = 120;
    // Signer 1 configuration inputs
    const deposit1 = 10000
    const interval1 = 1;
    const purchase1 = 2500
    const topUp1 = 5000;
    const depositAmount1 = ethers.utils.parseUnits(deposit1.toString(), 18);
    const purchaseAmount1 = ethers.utils.parseUnits(purchase1.toString(), 18);
    const topUpAmount1 = ethers.utils.parseUnits(topUp1.toString(), 18);

    const blocktime = 14;
    const timelockBlocks = 5;
    const minDelay = blocktime * timelockBlocks;

    let sourceToken, targetToken1, strategyFactory, gravToken, 
        timelock, governor, signer1, votingDelay, votingPeriod,
        blockNum, block, timestamp;

    let propState = [
        "Pending",
        "Active",
        "Canceled",
        "Defeated",
        "Succeeded",
        "Queued",
        "Expired",
        "Executed"
        ]

    before("Deploy governance contracts, core contracts, and testing tokens", async function () { 
        blockNum = await ethers.provider.getBlockNumber();
        block = await ethers.provider.getBlock(blockNum);
        timestamp = block.timestamp;

        // Get signers and send source token to signers 2-5
        [signer1] = await ethers.getSigners();

        // Deploy ERC20 source token
        const SourceToken = await ethers.getContractFactory("SourceToken");
        sourceToken = await SourceToken.deploy();
        await sourceToken.deployed();

        // Deploy ERC20 target token
        const TargetToken = await ethers.getContractFactory("TargetToken");
        targetToken1 = await TargetToken.deploy();
        await targetToken1.deployed();

        // Deploy Strategy Factory contract
        const StrategyFactory = await ethers.getContractFactory("StrategyFactory");
        strategyFactory = await StrategyFactory.deploy(upKeepInterval);
        await strategyFactory.deployed();

        // Deploy governance token
        const GravityToken = await ethers.getContractFactory("GravityToken");
        gravToken = await GravityToken.deploy();
        await gravToken.deployed();
        
        // Deploy timelock contract
        const Timelock = await ethers.getContractFactory("@openzeppelin/contracts/governance/TimelockController.sol:TimelockController");
        timelock = await Timelock.deploy(minDelay, [], []);
        await timelock.deployed();

        // Deploy governor contract
        const Governor = await ethers.getContractFactory("Universe");
        governor = await Governor.deploy(gravToken.address, timelock.address);
        await governor.deployed();

        // Set pair
        await strategyFactory.setPair(sourceToken.address, targetToken1.address);

        // Get voting configuration from governor contract
        votingDelay = ethers.BigNumber.from(await governor.votingDelay()).toNumber();
        votingPeriod = ethers.BigNumber.from(await governor.votingPeriod()).toNumber();

        // Grant timelock roles, revoke deployer's access, and transfer StrateyFactory ownership to timelock
        await timelock.grantRole(await timelock.PROPOSER_ROLE(), governor.address);
        await timelock.grantRole(await timelock.EXECUTOR_ROLE(), '0x0000000000000000000000000000000000000000');
        await timelock.revokeRole(await timelock.TIMELOCK_ADMIN_ROLE(), signer1.address);
        await strategyFactory.transferOwnership(timelock.address);
    });

    it("Proposal to set fee by governor should successfully execute", async function () {
        await gravToken.delegate(signer1.address, { from: signer1.address })
        const contractAddress = strategyFactory.address;
        const contract = await ethers.getContractAt('StrategyFactory', contractAddress);
        const fee = 0.35; // %
        const feeBigNumber = ethers.utils.parseUnits(fee.toString(), 18)
        const calldata_SetFee = contract.interface.encodeFunctionData("setFee", [feeBigNumber]);

        // Propose transaction
        const proposeTx = await governor.propose([contractAddress],
                                                 [0],
                                                 [calldata_SetFee],
                                                 "Proposal #1: Set fee",
                                                );
        const proposeReceipt = await proposeTx.wait(1);
        const proposalId_SetFee = proposeReceipt.events[0].args.proposalId;

        // Advance time forward 'votingDelay' blocks to open voting period
        let endTimestamp = timestamp + ((votingDelay + 1) * blocktime)
        while(timestamp <= endTimestamp) {
            await ethers.provider.send('evm_increaseTime', [blocktime]);
            await ethers.provider.send('evm_mine');
            timestamp = await getBlockTimestamp();
        }

        // Signer 1 votes
        let voteTx = await governor.connect(signer1).castVote(proposalId_SetFee, 1);
        
        // Assert state
        let state = await governor.state(proposalId_SetFee);
        assert.equal(propState[state], "Active");

        // Advance time forward 'votingPeriod' blocks (-1 on castVote block increment)
        endTimestamp = timestamp + (votingPeriod * blocktime);
        while(timestamp < endTimestamp) {
            await ethers.provider.send('evm_increaseTime', [blocktime]);
            await ethers.provider.send('evm_mine');
            timestamp = await getBlockTimestamp();
        }

        // Assert state
        state = await governor.state(proposalId_SetFee);
        assert.equal(propState[state], "Succeeded");

        // Queue proposal in timelock
        const descriptionHash = ethers.utils.id("Proposal #1: Set fee");
        const queueTx = await governor.queue([contractAddress], [0], [calldata_SetFee], descriptionHash,);

        // Assert state
        state = await governor.state(proposalId_SetFee);
        assert.equal(propState[state], "Queued");

        // Advance block forward 'timelockBlocks'
        endTimestamp = timestamp + (blocktime * timelockBlocks);
        while(timestamp <= endTimestamp) {
            await ethers.provider.send('evm_increaseTime', [blocktime]);
            await ethers.provider.send('evm_mine');
            timestamp = await getBlockTimestamp();
        }

        // Execute proposal
        const executeTx = await governor.execute([contractAddress], [0], [calldata_SetFee], descriptionHash,);

        // Assert state
        state = await governor.state(proposalId_SetFee);
        assert.equal(propState[state], "Executed");

        let feeValue = await strategyFactory.fee();
        let feeFormat = ethers.utils.formatUnits(feeValue, 18);
        assert.equal(feeFormat, fee);
    });

    it("Incurring a fee for initiating a new strategy should increase the treasury's balance and decrease the strategy's scheduled balance by the same amount", async function () {
        // Signer 1 initiates strategy
        await sourceToken.approve(strategyFactory.address, depositAmount1);
        await strategyFactory.initiateNewStrategy(sourceToken.address,
                                                  targetToken1.address,
                                                  depositAmount1,
                                                  interval1,
                                                  purchaseAmount1);

        const treasuryBalance = parseFloat(ethers.utils.formatUnits(await strategyFactory.treasury(), 18));
        const feeValue = parseFloat(ethers.utils.formatUnits(await strategyFactory.fee(), 18));
        assert.equal(treasuryBalance, (feeValue * deposit1 / 100));

        let scheduledBalance = 0;
        for(let i = 1; i <= (deposit1 / purchase1); i++) {
            let purchaseOrders = await strategyFactory.getPurchaseOrderDetails(i);
            for(let j = 0; j < purchaseOrders.length; j++) {
                if(purchaseOrders[j].user === signer1.address) {
                    scheduledBalance += parseFloat(ethers.utils.formatUnits(purchaseOrders[j].amount, 18));
                }
            }
        }
        assert.equal(scheduledBalance + treasuryBalance, deposit1);
    });

    it("Incurring a fee for topping up an existing strategy should increase the treasury's balance and decrease the strategy's scheduled balance by the same amount", async function () {        
        // Signer 1 tops up existing strategy
        const treasuryBalanceBefore = parseFloat(ethers.utils.formatUnits(await strategyFactory.treasury(), 18));
        await sourceToken.approve(strategyFactory.address, topUpAmount1);
        await strategyFactory.topUpStrategy(sourceToken.address,
                                            targetToken1.address,
                                            topUpAmount1);
        const treasuryBalanceAfter = parseFloat(ethers.utils.formatUnits(await strategyFactory.treasury(), 18));
        const feeValue = parseFloat(ethers.utils.formatUnits(await strategyFactory.fee(), 18));
        assert.equal((treasuryBalanceAfter - treasuryBalanceBefore), (feeValue * topUp1 / 100));
                
        let scheduledBalance = 0;
        for(let i = 1; i <= Math.round((deposit1 +  topUp1) / purchase1); i++) {
            let purchaseOrders = await strategyFactory.getPurchaseOrderDetails(i);
            for(let j = 0; j < purchaseOrders.length; j++) {
                if(purchaseOrders[j].user === signer1.address) {
                    scheduledBalance += parseFloat(ethers.utils.formatUnits(purchaseOrders[j].amount, 18));
                }
            }
        }
        assert.equal((scheduledBalance + treasuryBalanceAfter), (deposit1 + topUp1));
    });

});
