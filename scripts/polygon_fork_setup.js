
const hre = require("hardhat");
require('dotenv').config();

const DAI_SIGNER = "0x075e72a5eDf65F0A5f44699c7654C1a76941Ddc8";

const tokens = {
    'DAI': '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    'WETH': '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    'WBTC': '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
    'WMATIC': '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    'ZER0': '0x0000000000000000000000000000000000000000'
}

const pairIdMap = 
{
    1: {from: 'DAI', to: 'WETH'},
    2: {from: 'WETH', to: 'DAI'},
    3: {from: 'DAI', to: 'WBTC'},
    4: {from: 'WBTC', to: 'DAI'},
    5: {from: 'WETH', to: 'WBTC'},
    6: {from: 'WBTC', to: 'WETH'},
};

async function main() {
    
    async function configurePair(sourceAsset, targetAsset) {
        await strategyFactory.setPair(tokens[sourceAsset], tokens[targetAsset]);
        const getPair1Tx = await strategyFactory.getPairId(tokens[sourceAsset], tokens[targetAsset]);
        const pairId = ethers.BigNumber.from(getPair1Tx).toNumber();
        return pairId;
    }

    const [ signer1 ] = await hre.ethers.getSigners();
    const upKeepInterval = 120;
    console.log("Signer 1: ", signer1.address);
    console.log("Upkeep interval: ", upKeepInterval);

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

    ////////////////////////////////////////////////////////////////////////////////
    // Seed DAI from forked user into test account
    const provider = new ethers.providers.JsonRpcProvider();
    await provider.send("hardhat_impersonateAccount", [ DAI_SIGNER,]);
    const seedSigner = await provider.getSigner(DAI_SIGNER);
    const daiToken = new ethers.Contract(tokens['DAI'], abi, seedSigner);
    const balance = await daiToken.balanceOf(DAI_SIGNER);
    await daiToken.transfer(signer1.address, balance, {gasLimit: 125_000});
    const signer1Balance = ethers.utils.formatUnits(await daiToken.balanceOf(signer1.address), 18);
    console.log("Signer 1 seeded DAI balance: ", signer1Balance);
    await provider.send("hardhat_stopImpersonatingAccount", [ DAI_SIGNER,]);


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


    ////////////////////////////////////////////////////////////////////////////////
    // Set price feeds
    await strategyFactory.setPriceFeed(tokens['DAI'], '0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D'); // DAI
    await strategyFactory.setPriceFeed(tokens['WETH'], '0xF9680D99D6C9589e2a93a78A04A279e509205945'); // WETH
    await strategyFactory.setPriceFeed(tokens['WBTC'], '0xc907E116054Ad103354f2D350FD2514433D57F6f'); // WBTC
    await strategyFactory.setPriceFeed(tokens['WMATIC'], '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0'); // WMATIC
    
    ////////////////////////////////////////////////////////////////////////////////
    // Configure pairs and paths
    const pair1Id = await configurePair('DAI', 'WETH');
    console.log("Set DAI-WETH pair - pairId: ", pair1Id);

    const pair2Id = await configurePair('WETH', 'DAI');
    console.log("Set WETH-DAI pair - pairId: ", pair2Id);

    const pair3Id = await configurePair('DAI', 'WBTC');
    console.log("Set DAI-WBTC pair - pairId: ", pair3Id);

    const pair4Id = await configurePair('WBTC', 'DAI');
    console.log("Set WBTC-DAI pair - pairId: ", pair4Id);

    const pair5Id = await configurePair('WETH', 'WBTC');
    console.log("Set WETH-WBTC pair - pairId: ", pair5Id);

    const pair6Id = await configurePair('WBTC', 'WETH');
    console.log("Set WBTC-WETH pair - pairId: ", pair6Id);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error(error);
    process.exit(1);
});