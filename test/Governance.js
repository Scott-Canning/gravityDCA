const { assert, expect } = require("chai");
const { ethers } = require("hardhat");


async function getBlockTimestamp() {
    let blockNum = await ethers.provider.getBlockNumber();
    let block = await ethers.provider.getBlock(blockNum);
    return block.timestamp;
}

describe("Governance", function () {
    const upKeepInterval = 120;
    const blocktime = 14;
    const timelockBlocks = 5;
    const minDelay = blocktime * timelockBlocks;

    let sourceToken, targetToken, strategyFactory, gravToken, 
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
        targetToken = await TargetToken.deploy();
        await targetToken.deployed();

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

        // Get voting configuration from governor contract
        votingDelay = ethers.BigNumber.from(await governor.votingDelay()).toNumber();
        votingPeriod = ethers.BigNumber.from(await governor.votingPeriod()).toNumber();
    });

    it("Modifying initial TimelockController roles via grantRole(PROPOSER, EXECUTOR) and revokeRole(ADMIN) should succeed", async function () {
        // Grant timelock roles 
        await timelock.grantRole(await timelock.PROPOSER_ROLE(), governor.address);
        await timelock.grantRole(await timelock.EXECUTOR_ROLE(), '0x0000000000000000000000000000000000000000');
        const govHasPropRole = await timelock.hasRole(timelock.PROPOSER_ROLE(), governor.address);
        const everyoneHasExecRole = await timelock.hasRole(timelock.EXECUTOR_ROLE(), '0x0000000000000000000000000000000000000000');
        assert.isTrue(govHasPropRole);
        assert.isTrue(everyoneHasExecRole);

        // Upon deployment both the deployer and timelock have the admin role, revoke deployer's access
        await timelock.revokeRole(await timelock.TIMELOCK_ADMIN_ROLE(), signer1.address);
        const timelockHasAdminRole = await timelock.hasRole(timelock.TIMELOCK_ADMIN_ROLE(), timelock.address);
        const deployerHasAdminRole = await timelock.hasRole(timelock.TIMELOCK_ADMIN_ROLE(), signer1.address);
        assert.isTrue(timelockHasAdminRole);
        assert.isFalse(deployerHasAdminRole);
    });

    it("After revoking ADMIN role, deployer should no longer be capable of modifying TimelockController roles", async function () {
        await expect(timelock.grantRole(await timelock.PROPOSER_ROLE(), signer1.address)).to.be.reverted;
        await expect(timelock.grantRole(await timelock.EXECUTOR_ROLE(), signer1.address)).to.be.reverted;
        await expect(timelock.revokeRole(await timelock.TIMELOCK_ADMIN_ROLE(), signer1.address)).to.be.reverted;
    });
    
    it("TimelockController should be owner of the StrategyFactory contract", async function () {
        // Transition ownership of strategyFactory to Timecontroller
        await strategyFactory.transferOwnership(timelock.address);
        const owner = await strategyFactory.owner();
        assert.equal(owner, timelock.address);
    });

    it("Attempts to set source and target tokens by non-owner should revert", async function () {
        await expect(strategyFactory.setSourceToken(sourceToken.address)).to.be
                            .revertedWith( "Ownable: caller is not the owner");

        await expect(strategyFactory.setTargetToken(targetToken.address)).to.be
                            .revertedWith( "Ownable: caller is not the owner");
    });

    it("Proposal to set source token by governor should successfully execute", async function () {
        await gravToken.delegate(signer1.address, { from: signer1.address })
    
        const contractAddress = strategyFactory.address;
        const contract = await ethers.getContractAt('StrategyFactory', contractAddress);
        const sourceTokenAddress = sourceToken.address;
        const calldata_SetSource = contract.interface.encodeFunctionData("setSourceToken", [sourceTokenAddress]);

        // Propose transaction
        const proposeTx = await governor.propose([contractAddress],
                                                 [0],
                                                 [calldata_SetSource],
                                                 "Proposal #1: Set source token",
                                                );
        const proposeReceipt = await proposeTx.wait(1);
        const proposalId_SetSource = proposeReceipt.events[0].args.proposalId;

        // Advance time forward 'votingDelay' blocks to open voting period
        let endTimestamp = timestamp + ((votingDelay + 1) * blocktime)
        while(timestamp <= endTimestamp) {
            await ethers.provider.send('evm_increaseTime', [blocktime]);
            await ethers.provider.send('evm_mine');
            timestamp = await getBlockTimestamp();
        }

        // Signer 1 votes
        let voteTx = await governor.connect(signer1).castVote(proposalId_SetSource, 1);
        
        // Assert state
        let state = await governor.state(proposalId_SetSource);
        assert.equal(propState[state], "Active");

        // Advance time forward 'votingPeriod' blocks (-1 on castVote block increment)
        endTimestamp = timestamp + (votingPeriod * blocktime);
        while(timestamp < endTimestamp) {
            await ethers.provider.send('evm_increaseTime', [blocktime]);
            await ethers.provider.send('evm_mine');
            timestamp = await getBlockTimestamp();
        }

        // Assert state
        state = await governor.state(proposalId_SetSource);
        assert.equal(propState[state], "Succeeded");

        // Queue proposal in timelock
        const descriptionHash = ethers.utils.id("Proposal #1: Set source token");
        const queueTx = await governor.queue([contractAddress], [0], [calldata_SetSource], descriptionHash,);

        // Assert state
        state = await governor.state(proposalId_SetSource);
        assert.equal(propState[state], "Queued");

        // Advance block forward 'timelockBlocks'
        endTimestamp = timestamp + (blocktime * timelockBlocks);
        while(timestamp <= endTimestamp) {
            await ethers.provider.send('evm_increaseTime', [blocktime]);
            await ethers.provider.send('evm_mine');
            timestamp = await getBlockTimestamp();
        }

        // Execute proposal
        const executeTx = await governor.execute([contractAddress], [0], [calldata_SetSource], descriptionHash,);

        // Assert state
        state = await governor.state(proposalId_SetSource);
        assert.equal(propState[state], "Executed");

        let sourceTokenIndex = await strategyFactory.getSourceTokenIdx(sourceTokenAddress);
        assert.equal(sourceTokenIndex, 0);

        let sourceTokenAddr = await strategyFactory.getSourceTokenAddr(sourceTokenIndex);
        assert.equal(sourceTokenAddr, sourceTokenAddress);
    });

    it("Proposal to set target token by governor should successfully execute", async function () {
        await gravToken.delegate(signer1.address, { from: signer1.address })
    
        const contractAddress = strategyFactory.address;
        const contract = await ethers.getContractAt('StrategyFactory', contractAddress);
        const targetTokenAddress = targetToken.address;
        const calldata_SetTarget = contract.interface.encodeFunctionData("setTargetToken", [targetTokenAddress]);

        // Propose transaction
        const proposeTx = await governor.propose([contractAddress],
                                                 [0],
                                                 [calldata_SetTarget],
                                                 "Proposal #1: Set source token",
                                                );
        const proposeReceipt = await proposeTx.wait(1);
        const proposalId_SetTarget = proposeReceipt.events[0].args.proposalId;

        // Advance time forward 'votingDelay' blocks to open voting period
        let endTimestamp = timestamp + ((votingDelay + 1) * blocktime)
        while(timestamp <= endTimestamp) {
            await ethers.provider.send('evm_increaseTime', [blocktime]);
            await ethers.provider.send('evm_mine');
            timestamp = await getBlockTimestamp();
        }

        // Signer 1 votes
        const voteTx = await governor.connect(signer1).castVote(proposalId_SetTarget, 1);
        
        // Assert state
        let state = await governor.state(proposalId_SetTarget);
        assert.equal(propState[state], "Active");

        // Advance time forward 'votingPeriod' blocks (-1 on castVote block increment)
        endTimestamp = timestamp + (votingPeriod * blocktime);
        while(timestamp < endTimestamp) {
            await ethers.provider.send('evm_increaseTime', [blocktime]);
            await ethers.provider.send('evm_mine');
            timestamp = await getBlockTimestamp();
        }

        // Assert state
        state = await governor.state(proposalId_SetTarget);
        assert.equal(propState[state], "Succeeded");

        // Queue proposal in timelock
        const descriptionHash = ethers.utils.id("Proposal #1: Set source token");
        const queueTx = await governor.queue([contractAddress], [0], [calldata_SetTarget], descriptionHash,);

        // Assert state
        state = await governor.state(proposalId_SetTarget);
        assert.equal(propState[state], "Queued");

        // Advance block forward 'timelockBlocks'
        endTimestamp = timestamp + (blocktime * timelockBlocks);
        while(timestamp <= endTimestamp) {
            await ethers.provider.send('evm_increaseTime', [blocktime]);
            await ethers.provider.send('evm_mine');
            timestamp = await getBlockTimestamp();
        }

        // Execute proposal
        const executeTx = await governor.execute([contractAddress], [0], [calldata_SetTarget], descriptionHash,);

        // Assert state
        state = await governor.state(proposalId_SetTarget);
        assert.equal(propState[state], "Executed");

        let targetTokenIndex = await strategyFactory.getTargetTokenIdx(targetTokenAddress);
        assert.equal(targetTokenIndex, 0);

        let targetTokenAddr = await strategyFactory.getTargetTokenAddr(targetTokenIndex);
        assert.equal(targetTokenAddr, targetTokenAddress);
    });


});
