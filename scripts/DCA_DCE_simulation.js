// DCA_DCE_simulation.js
// npx hardhat run scripts/DCA_DCE_simulation.js --network localhost
// StrategyFactory.sol -> bool public localTesting = true

const hre = require("hardhat");
require('dotenv').config();

const DAI_SIGNER = "0x075e72a5eDf65F0A5f44699c7654C1a76941Ddc8";
const ZER0 = '0x0000000000000000000000000000000000000000';

// Polygon token addresses
const pairs = {
    '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063': 'DAI',
    '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619': 'WETH',
    '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6': 'WBTC',
    '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270': 'WMATIC',
    '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174': 'USDC',
    '0x0000000000000000000000000000000000000000': 'ZER0'
}

const reversePairs = {
    'DAI': '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    'WETH': '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    'WBTC': '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
    'WMATIC': '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    'ZER0': '0x0000000000000000000000000000000000000000'
}

class Strategy {
    constructor(sourceAsset, targetAsset, pairId, deposit, interval, purchaseAmount) {
        this.sourceAsset =  sourceAsset;
        this.targetAsset = targetAsset;
        this.pairId = pairId;
        this.deposit = deposit
        this.parsedDeposit = ethers.utils.parseUnits((this.deposit).toString(), 18);
        this.interval = interval;
        this.purchaseAmount = purchaseAmount;
        this.parsedPurchaseAmount = ethers.utils.parseUnits(this.purchaseAmount.toString(), 18);
    }
}

class User {
    constructor(signer) {
        this.signer = signer
        this.strategies = [];
    }
}

async function main() {
    async function fastForwardChain(strategy) {
        console.log("------------------------------------------------------------");
        let blockNum = await ethers.provider.getBlockNumber();
        let block = await ethers.provider.getBlock(blockNum);
        let timestamp = block.timestamp;
        let endTimestamp = timestamp + ((((strategy.deposit / strategy.purchaseAmount) * 3) * strategy.interval) * upKeepInterval);
        console.log("timestamp:                     ", timestamp);
        console.log("(endTimestamp - timestamp) / upKeepInterval: ", (endTimestamp - timestamp) / upKeepInterval);
        let purchaseSlot = 0; 
        while(timestamp <= endTimestamp) {
            await strategyFactory.checkUpkeepTEST(strategy.pairId, {gasLimit: 1_000_000});
            purchaseSlot = await strategyFactory.purchaseSlot();
            await ethers.provider.send('evm_increaseTime', [upKeepInterval]);
            await ethers.provider.send('evm_mine');
            blockNum = await ethers.provider.getBlockNumber();
            console.log("slot", ethers.BigNumber.from(purchaseSlot).toNumber(), "[", blockNum, "]");
            block = await ethers.provider.getBlock(blockNum);
            timestamp = block.timestamp;
        }
    }

    async function configurePair(sourceAsset, targetAsset) {
        await strategyFactory.setPair(reversePairs[sourceAsset], reversePairs[targetAsset]);
        const getPair1Tx = await strategyFactory.getPairId(reversePairs[sourceAsset], reversePairs[targetAsset]);
        const pairId = ethers.BigNumber.from(getPair1Tx).toNumber();
        return pairId;
    }

    function printStrategyInit(strategy) {
        console.log("------------------------------------------------------------");
        console.log("Strategy Initiated:");
        console.log("   Source asset:    ", strategy.sourceAsset);
        console.log("   Target asset:    ", strategy.targetAsset);
        console.log("   Deposit:         ", strategy.deposit);
        console.log("   Interval:        ", strategy.interval);
        console.log("   Purchase amount: ", strategy.purchaseAmount);
    }

    async function printStrategyResults(address, pairId) {
        let tx = await strategyFactory.getStrategyDetails(address, pairId);
        console.log("------------------------------------------------------------");
        console.log("Strategy Completed:");
        console.log("   Next slot:          ", ethers.BigNumber.from(tx.nextSlot).toNumber());
        console.log("   Target balance:     ", ethers.utils.formatUnits(tx.targetBalance, 18));
        console.log("   Interval:           ", ethers.BigNumber.from(tx.interval).toNumber());
        console.log("   Purchase amount:    ", ethers.utils.formatUnits(tx.purchaseAmount, 18));
        console.log("   Purchases remaining:", ethers.BigNumber.from(tx.purchasesRemaining).toNumber());
    }
    
    async function printFactoryBalances(token, sourceAsset) {
        console.log("------------------------------------------------------------");
        let sourceBalance = await token.balanceOf(strategyFactory.address);
        let treasury = await strategyFactory.getTreasury(reversePairs[sourceAsset]);
        console.log(`Strategy factory ${sourceAsset} balance: `, ethers.utils.formatUnits(sourceBalance, 18));
        console.log("Strategy factory treasury balance: ", ethers.utils.formatUnits(treasury, 18));
    }
    
    const [ signer1, signer2 ] = await hre.ethers.getSigners();
    const upKeepInterval = 60 * 60 * 24;

    ////////////////////////////////////////////////////////////////////////////////
    // Seed user1.signer with DAI rom impersonated account
    const abi = [
        // Read-Only Functions
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",

        // Authenticated Functions
        "function transfer(address to, uint amount) returns (boolean)",
        "function approve(address spender, uint256 amount) external returns (bool)",

        // Events
        "event Transfer(address indexed from, address indexed to, uint amount)",
    ];
    const provider = new ethers.providers.JsonRpcProvider();
    await provider.send("hardhat_impersonateAccount", [ DAI_SIGNER,]);
    const seedSigner = await provider.getSigner(DAI_SIGNER);
    const daiToken = new ethers.Contract(reversePairs['DAI'], abi, seedSigner);
    const wETHtoken = new ethers.Contract(reversePairs['WETH'], abi, seedSigner);
    const wBTCtoken = new ethers.Contract(reversePairs['WBTC'], abi, seedSigner);
    const wMATICtoken = new ethers.Contract(reversePairs['WMATIC'], abi, seedSigner);
    const balance = await daiToken.balanceOf(DAI_SIGNER);
    await daiToken.transfer(signer1.address, balance, {gasLimit: 125_000});
    const signer1Balance = ethers.utils.formatUnits(await daiToken.balanceOf(signer1.address), 18);
    console.log("Signer 1 seeded DAI balance: ", signer1Balance);
    await provider.send("hardhat_stopImpersonatingAccount", [ DAI_SIGNER,]);
    //
    //
    ////////////////////////////////////////////////////////////////////////////////



    ////////////////////////////////////////////////////////////////////////////////
    // Deploy Strategy Factory contract
    const StrategyFactory = await hre.ethers.getContractFactory("StrategyFactory");
    const strategyFactory = await StrategyFactory.deploy(upKeepInterval);
    await strategyFactory.deployed();
    const fee = 0.35; // % (35 bps)
    const feeParsed = ethers.utils.parseUnits(fee.toString(), 18);
    await strategyFactory.setFee(feeParsed);
    console.log("Factory address:     ", strategyFactory.address);
    console.log("Factory fee:         ", ethers.utils.formatUnits(await strategyFactory.fee(), 18));
    //
    //
    ////////////////////////////////////////////////////////////////////////////////



    ////////////////////////////////////////////////////////////////////////////////
    // Set price feeds
    await strategyFactory.setPriceFeed('0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', '0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D'); // DAI
    await strategyFactory.setPriceFeed('0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', '0xF9680D99D6C9589e2a93a78A04A279e509205945'); // WETH
    await strategyFactory.setPriceFeed('0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', '0xc907E116054Ad103354f2D350FD2514433D57F6f'); // WBTC
    await strategyFactory.setPriceFeed('0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0'); // WMATIC
    //
    //
    ////////////////////////////////////////////////////////////////////////////////



    ////////////////////////////////////////////////////////////////////////////////
    // Configure pairs and paths
    const pair1Id = await configurePair('DAI', 'WETH');
    // await strategyFactory.setPath(pair1Id, 
    //                               5, 
    //                               reversePairs['DAI'],
    //                               100, 
    //                               reversePairs['USDC'],
    //                               3000, 
    //                               reversePairs['WETH'],
    //                               0, 
    //                               ZER0
    // );
    console.log("Set DAI-ETH pair - pairId: ", pair1Id);

    const pair2Id = await configurePair('WETH', 'DAI');
    // await strategyFactory.setPath(pair2Id, 
    //                               5, 
    //                               reversePairs['WETH'],
    //                               3000,
    //                               reversePairs['USDC'],
    //                               100, 
    //                               reversePairs['DAI'],
    //                               0, 
    //                               ZER0
    // );
    console.log("Set ETH-DAI pair - pairId: ", pair2Id);
    //
    //
    ///////////////////////////////////////////////////////////////////////////////



    ////////////////////////////////////////////////////////////////////////////////
    // Create user1
    let user1 = new User(signer1);
    //
    //
    ////////////////////////////////////////////////////////////////////////////////



    ////////////////////////////////////////////////////////////////////////////////
    // user1 initiates new strategy
    user1.strategies.push(new Strategy('DAI', 'WETH', 1, 10000, 30, 2500));
    printStrategyInit(user1.strategies[0]);
    await daiToken.connect(user1.signer).approve(strategyFactory.address, user1.strategies[0].parsedDeposit);
    await strategyFactory.connect(user1.signer).initiateNewStrategy(reversePairs[user1.strategies[0].sourceAsset],
                                                                    reversePairs[user1.strategies[0].targetAsset],
                                                                    user1.strategies[0].parsedDeposit,
                                                                    user1.strategies[0].interval,
                                                                    user1.strategies[0].parsedPurchaseAmount);
    await printFactoryBalances(daiToken, user1.strategies[0].sourceAsset);
    await fastForwardChain(user1.strategies[0], upKeepInterval);
    await printStrategyResults(user1.signer.address, user1.strategies[0].pairId);
    //
    //
    ////////////////////////////////////////////////////////////////////////////////



    ////////////////////////////////////////////////////////////////////////////////
    // User 1 withdraws WETH
    console.log("------------------------------------------------------------");
    let detailsTx = await strategyFactory.getStrategyDetails(user1.signer.address, pair1Id);
    await strategyFactory.connect(user1.signer).withdrawTarget(pair1Id, detailsTx.targetBalance, {gasLimit: 100000});
    console.log("User 1 withdraws target asset from Strategy 1 - balance: ", ethers.utils.formatUnits(await wETHtoken.balanceOf(user1.signer.address)));
    ////////////////////////////////////////////////////////////////////////////////



    ////////////////////////////////////////////////////////////////////////////////
    // user1 initiates new DCE strategy
    user1.strategies.push(new Strategy('WETH', 'DAI', 2, ethers.utils.formatUnits(detailsTx.targetBalance, 18), 7, 1));
    printStrategyInit(user1.strategies[1]);
    await wETHtoken.connect(user1.signer).approve(strategyFactory.address, user1.strategies[1].parsedDeposit);
    await strategyFactory.connect(user1.signer).initiateNewStrategy(reversePairs[user1.strategies[1].sourceAsset],
                                                                    reversePairs[user1.strategies[1].targetAsset],
                                                                    user1.strategies[1].parsedDeposit,
                                                                    user1.strategies[1].interval,
                                                                    user1.strategies[1].parsedPurchaseAmount);
    await printFactoryBalances(wETHtoken, user1.strategies[1].sourceAsset);
    await fastForwardChain(user1.strategies[1], upKeepInterval);
    await printStrategyResults(user1.signer.address, user1.strategies[1].pairId);
    //
    //
    ////////////////////////////////////////////////////////////////////////////////
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error(error);
    process.exit(1);
});