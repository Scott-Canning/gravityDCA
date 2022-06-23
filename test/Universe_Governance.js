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
        timelock, governor, signer1, signer2, votingDelay, votingPeriod,
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
        [ signer1, signer2 ] = await ethers.getSigners();

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

    it("Attempts to set new pairs by non-owner should revert", async function () {
        await expect(strategyFactory.setPair(sourceToken.address, targetToken.address))
                            .to.be.revertedWith( "Ownable: caller is not the owner");

        await expect(strategyFactory.setPair(targetToken.address, sourceToken.address))
                            .to.be.revertedWith( "Ownable: caller is not the owner");
    });

    it("Proposal to set pair by governor with sufficient votes should successfully execute", async function () {
        await gravToken.delegate(signer1.address, { from: signer1.address })
        const contractAddress = strategyFactory.address;
        const contract = await ethers.getContractAt('StrategyFactory', contractAddress);
        const sourceTokenAddress = sourceToken.address;
        const targetTokenAddress = targetToken.address;
        const calldata = contract.interface.encodeFunctionData("setPair", [sourceTokenAddress, targetTokenAddress]);

        // Propose transaction
        const proposeTx = await governor.propose([contractAddress],
                                                 [0],
                                                 [calldata],
                                                 "Proposal #1: Set pair",
                                                 {gasLimit: 850_000});
        const proposeReceipt = await proposeTx.wait(1);
        const proposalId = proposeReceipt.events[0].args.proposalId;

        // Advance time forward 'votingDelay' blocks to open voting period
        let endTimestamp = timestamp + ((votingDelay + 2) * blocktime)
        while(timestamp <= endTimestamp) {
            await ethers.provider.send('evm_increaseTime', [blocktime]);
            await ethers.provider.send('evm_mine');
            timestamp = await getBlockTimestamp();
        }

        // Signer 1 votes
        const voteTx = await governor.connect(signer1).castVote(proposalId, 1);
        
        // Assert state
        let state = await governor.state(proposalId);
        assert.equal(propState[state], "Active");

        // Advance time forward 'votingPeriod' blocks (-1 on castVote block increment)
        endTimestamp = timestamp + (votingPeriod * blocktime);
        while(timestamp < endTimestamp) {
            await ethers.provider.send('evm_increaseTime', [blocktime]);
            await ethers.provider.send('evm_mine');
            timestamp = await getBlockTimestamp();
        }

        // Assert state
        state = await governor.state(proposalId);
        assert.equal(propState[state], "Succeeded");

        // Queue proposal in timelock
        const descriptionHash = ethers.utils.id("Proposal #1: Set pair");
        const queueTx = await governor.queue([contractAddress], [0], [calldata], descriptionHash);

        // Assert state
        state = await governor.state(proposalId);
        assert.equal(propState[state], "Queued");

        // Advance block forward 'timelockBlocks'
        endTimestamp = timestamp + (blocktime * timelockBlocks);
        while(timestamp <= endTimestamp) {
            await ethers.provider.send('evm_increaseTime', [blocktime]);
            await ethers.provider.send('evm_mine');
            timestamp = await getBlockTimestamp();
        }

        // Execute proposal
        const executeTx = await governor.execute([contractAddress], [0], [calldata], descriptionHash);

        // Assert state
        state = await governor.state(proposalId);
        assert.equal(propState[state], "Executed");

        let pairId = await strategyFactory.getPairId(sourceTokenAddress, targetTokenAddress);
        assert.equal(pairId, 1);
    });

    it("Proposal transaction should revert if token count is below proposal threshold", async function () {
        // Signer 1 transfers governance tokens, falling below 10,000 proposal threshold
        const transfer = ethers.utils.parseUnits("9999000", 18);
        await gravToken.transfer(signer2.address, transfer);
        
        await gravToken.delegate(signer1.address, { from: signer1.address })
        const contractAddress = strategyFactory.address;
        const contract = await ethers.getContractAt('StrategyFactory', contractAddress);
        const sourceTokenAddress = targetToken.address;
        const targetTokenAddress = sourceToken.address;
        const calldata = contract.interface.encodeFunctionData("setPair", [sourceTokenAddress, targetTokenAddress]);

        // Propose transaction
        await expect(governor.propose([contractAddress],
                                      [0],
                                      [calldata],
                                      "Proposal #1: Set pair",))
                                      .to.be
                                      .revertedWith("Governor: proposer votes below proposal threshold");
    });

});
