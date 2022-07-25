
const { assert, expect } = require("chai");
const { ethers } = require("hardhat");

async function getBlockTimestamp() {
    let blockNum = await ethers.provider.getBlockNumber();
    let block = await ethers.provider.getBlock(blockNum);
    return block.timestamp;
}

describe("StrategyFactory.sol: withdrawTreasury()", function () {
    const upKeepInterval = 120;
    const blocktime = 14;
    const timelockBlocks = 5;
    const minDelay = blocktime * timelockBlocks;

    // Strategy inputs
    const deposit1 = 10000
    const interval1 = 1;
    const purchase1 = 2500
    const depositAmount1 = ethers.utils.parseUnits(deposit1.toString(), 18);
    const purchaseAmount1 = ethers.utils.parseUnits(purchase1.toString(), 18);

    let sourceToken, targetToken1, strategyFactory, gravToken, 
        timelock, governor, signer1, signer2, signer3, signer4,
        votingDelay, votingPeriod, blockNum, block;

    let propState = [
        "Pending",
        "Active",
        "Canceled",
        "Defeated",
        "Succeeded",
        "Queued",
        "Expired",
        "Executed"
        ];

    beforeEach("Deploy governance contracts, core contracts, and testing tokens", async function () { 
        blockNum = await ethers.provider.getBlockNumber();
        block = await ethers.provider.getBlock(blockNum);
        timestamp = block.timestamp;

        // Deploy ERC20 source token
        const SourceToken = await ethers.getContractFactory("SourceToken");
        sourceToken = await SourceToken.deploy();
        await sourceToken.deployed();

        // Deploy ERC20 target token 1
        const TargetToken1 = await ethers.getContractFactory("TargetToken");
        targetToken1 = await TargetToken1.deploy();
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
        const Timelock = await ethers.getContractFactory("contracts/TimelockController.sol:TimelockController");
        timelock = await Timelock.deploy(minDelay, [], []);
        await timelock.deployed();

        // Deploy governor contract
        const Governor = await ethers.getContractFactory("Universe");
        governor = await Governor.deploy(gravToken.address, timelock.address);
        await governor.deployed();

        // Set pair
        await strategyFactory.setPair(sourceToken.address, targetToken1.address);
        const getPair1Tx = await strategyFactory.getPairId(sourceToken.address, targetToken1.address);
        pair1Id = ethers.BigNumber.from(getPair1Tx).toNumber();

        // Get signers and send source token to other signers
        [ signer1, signer2, signer3, signer4 ] = await ethers.getSigners();
        const transferAmount1 = ethers.utils.parseUnits("10000", 18);
        await sourceToken.transfer(signer2.address, transferAmount1);

        const transferAmount2 = ethers.utils.parseUnits("10000", 18);
        await sourceToken.transfer(signer3.address, transferAmount2);

        const transferAmount3 = ethers.utils.parseUnits("10000", 18);
        await sourceToken.transfer(signer4.address, transferAmount3);

        // Get voting configuration from governor contract
        votingDelay = ethers.BigNumber.from(await governor.votingDelay()).toNumber();
        votingPeriod = ethers.BigNumber.from(await governor.votingPeriod()).toNumber();

        // Set fee (note: for testing purposes using signer1 as current owner)
        const fee = 0.65; // %
        const feeBigNumber = ethers.utils.parseUnits(fee.toString(), 18)
        await strategyFactory.setFee(feeBigNumber);

        // Grant timelock roles
        await timelock.grantRole(await timelock.PROPOSER_ROLE(), governor.address);
        await timelock.grantRole(await timelock.EXECUTOR_ROLE(), '0x0000000000000000000000000000000000000000');

        // Upon deployment both the deployer and timelock have the admin role, revoke deployer's access
        await timelock.revokeRole(await timelock.TIMELOCK_ADMIN_ROLE(), signer1.address);

        // Transition ownership of strategyFactory to Timecontroller
        await strategyFactory.transferOwnership(timelock.address);

        // Initiate mock strategies to fund treasury via fee incurrence
        await sourceToken.approve(strategyFactory.address, depositAmount1);
        await strategyFactory.initiateNewStrategy(sourceToken.address,
                                                  targetToken1.address,
                                                  depositAmount1,
                                                  interval1,
                                                  purchaseAmount1);

        await sourceToken.connect(signer2).approve(strategyFactory.address, depositAmount1);
        await strategyFactory.connect(signer2).initiateNewStrategy(sourceToken.address,
                                                                   targetToken1.address,
                                                                   depositAmount1,
                                                                   interval1,
                                                                   purchaseAmount1);

        await sourceToken.connect(signer3).approve(strategyFactory.address, depositAmount1);
        await strategyFactory.connect(signer3).initiateNewStrategy(sourceToken.address,
                                                                    targetToken1.address,
                                                                    depositAmount1,
                                                                    interval1,
                                                                    purchaseAmount1);

        await sourceToken.connect(signer4).approve(strategyFactory.address, depositAmount1);
        await strategyFactory.connect(signer4).initiateNewStrategy(sourceToken.address,
                                                                    targetToken1.address,
                                                                    depositAmount1,
                                                                    interval1,
                                                                    purchaseAmount1);

    });

    it("Attempt to withdraw treasury by non-owner should revert", async function () {
        const treasuryBalance = parseFloat(ethers.utils.formatUnits(await strategyFactory.getTreasury(sourceToken.address), 18));
        await expect(strategyFactory.withdrawTreasury(sourceToken.address, treasuryBalance))
                            .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Proposal to withdraw amount equal to treasury balance into timelock contract should successfully execute", async function () {
        await gravToken.delegate(signer1.address, { from: signer1.address });
        const contractAddress = strategyFactory.address;
        const contract = await ethers.getContractAt('StrategyFactory', contractAddress);
        const treasuryBalance = await strategyFactory.getTreasury(sourceToken.address);
        const calldata = contract.interface.encodeFunctionData("withdrawTreasury", [sourceToken.address, treasuryBalance]);

        // Propose transaction
        const proposeTx = await governor.propose([contractAddress],
                                                 [0],
                                                 [calldata],
                                                 "Proposal #1: Withdraw treasury",
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

        // Advance time forward 'votingPeriod' blocks
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
        const descriptionHash = ethers.utils.id("Proposal #1: Withdraw treasury");
        const queueTx = await governor.queue([contractAddress], [0], [calldata], descriptionHash,);

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
        const executeTx = await governor.execute([contractAddress], [0], [calldata], descriptionHash,);

        // Assert state
        state = await governor.state(proposalId_SetFee);
        assert.equal(propState[state], "Executed");

        const timelockBalance = parseFloat(ethers.utils.formatUnits(await sourceToken.balanceOf(timelock.address), 18));
        const treasuryBalanceFormatted = parseFloat(ethers.utils.formatUnits(treasuryBalance, 18));
        assert.equal(treasuryBalanceFormatted, timelockBalance);
    });

    it("Proposal to withdraw amount exceeding treasury balance into timelock contract should successfully execute", async function () {
        await gravToken.delegate(signer1.address, { from: signer1.address });
        const contractAddress = strategyFactory.address;
        const contract = await ethers.getContractAt('StrategyFactory', contractAddress);
        const exceed = 1;
        const treasuryBalanceExceeded = parseFloat(ethers.utils.formatUnits(await strategyFactory.getTreasury(sourceToken.address), 18)) + exceed;
        const treasuryBalanceExceededBigNum = ethers.utils.parseUnits(treasuryBalanceExceeded.toString(), 18);
        const calldata = contract.interface.encodeFunctionData("withdrawTreasury", [sourceToken.address, treasuryBalanceExceededBigNum]);

        // Propose transaction
        const proposeTx = await governor.propose([contractAddress],
                                                 [0],
                                                 [calldata],
                                                 "Proposal #1: Withdraw treasury",
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

        // Advance time forward 'votingPeriod' blocks
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
        const descriptionHash = ethers.utils.id("Proposal #1: Withdraw treasury");
        const queueTx = await governor.queue([contractAddress], [0], [calldata], descriptionHash,);

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
        await expect(governor.execute([contractAddress], [0], [calldata], descriptionHash,))
                        .to.be.revertedWith("TimelockController: underlying transaction reverted");
    });

});