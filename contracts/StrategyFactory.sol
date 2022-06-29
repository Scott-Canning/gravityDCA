//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

/**
 * @notice Implementation of the Gravity Strategy Factory contract. Handles pair account, 
 * strategy initiation, strategy topping up, keeper automation, swapping, and target
 * withdrawal.
 */
contract StrategyFactory is Ownable {    
    uint public purchaseSlot;
    uint public lastTimeStamp;
    uint public immutable upKeepInterval;
    uint public fee;
    uint public maxDiscount = 99;
    
    /// @notice pool fee set to 0.3%
    uint24 public constant poolFee = 3000;                      
    ISwapRouter public immutable swapRouter = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    /// @notice oracle pricefeed
    AggregatorV3Interface internal priceFeed;

    /**
    * @notice Mapping of each user's live strategy for each respective asset 
    * ( user address => ( strategy pairId => strategy configuration ) )
    */ 
    mapping (address => mapping (uint => Strategy)) public accounts;
    
    /**
    * @notice Mapping for each purchase slot's purchase order array
    * ( day's purchase slot => purchase order array )
    */     
    mapping (uint => PurchaseOrder[]) public purchaseOrders;

    /**
    * @notice Forward mapping for a pair's addresses to id
    * ( fromToken address => ( toToken address => pair id )
    */     
    mapping (address => mapping (address => uint)) public pairs;

    /**
    * @notice Reverse index array for all pairs
    * Pairs[ pairId ] = Pair( fromToken, toToken )
    */   
    Pair[] public reversePairs;

    /**
    * @notice Treasury mapping for each respective asset 
    * ( source asset address => accumulated treasury )
    */ 
    mapping (address => uint) public treasury;

    /**
    * @notice Oracle price fee mapping for each asset 
    * (ERC20 token address => oracle price feed address)
    */ 
    mapping (address => address) public priceFeeds;

    /// @notice Used for slotting a user's future purchase orders
    struct PurchaseOrder {
        address         user;
        uint            amount;
        uint            pairId;
    }

    /// @notice Used for tracking a user's DCA strategy for pair
    struct Strategy {
        uint            nextSlot;
        uint            targetBalance;
        uint            interval;
        uint            purchaseAmount;
        uint            purchasesRemaining;
    }

    /// @notice Used for specifying unique asset pairs and routing paths
    struct Pair {
        address         fromToken;
        address         toToken;
        bytes           path;
    }

    event StrategyInitiated(address account, uint nextPurchaseSlot);
    event StrategyToppedUp(address account, uint topUpPurchaseSlot);
    event Deposited(uint timestamp, address from, uint sourceDeposited);
    event Withdrawal(address account, uint amount);

    /// @notice Set Keepers upkeep interval, last timestamp, 1-base pairId (avoid default mapping value)
    constructor(uint _upKeepInterval) {
        upKeepInterval = _upKeepInterval;
        lastTimeStamp = block.timestamp;
        reversePairs.push(Pair(address(0), address(0), ""));
    }

    /**
     * @notice 'accounts' nested mapping getter
     * @param user Address of user account
     * @param pairId Strategy pairId of the source and target assets
     * @return Strategy struct mapped from user's address and strategy pairId
     */
    function getStrategyDetails(address user, uint pairId) public view returns (Strategy memory) {
        return accounts[user][pairId];
    }

    /**
     * @notice 'purchaseOrders' mapping getter
     * @param slot Purchase slot for which details are being sought
     * @return PurchaseOrder array containing all purchase orders of the passed purchase slot
     */
    function getPurchaseOrderDetails(uint slot) public view returns (PurchaseOrder[] memory) {
        return purchaseOrders[slot];
    }

    /**
     * @notice Enables new strategy pairing
     * @param fromToken Token that funds _toToken purchase
     * @param toToken Token that gets purchased with _fromToken
     */
    function setPair(address fromToken, address toToken) external onlyOwner {
        require(pairs[fromToken][toToken] == 0, "Pair exists");
        uint _pairId = reversePairs.length;
        pairs[fromToken][toToken] = _pairId;
        reversePairs.push(Pair(fromToken, toToken, ""));
    }

    /**
     * @notice 'pairId' getter
     * @param fromToken Token address that funds _toToken purchase
     * @param toToken Token address that gets purchased with _fromToken
     */
    function getPairId(address fromToken, address toToken) public view returns (uint) {
        return pairs[fromToken][toToken];
    }

    /**
     * @notice Pair's addresses getter
     * @param pairId pairId of the pair's addresses being sought
     * @return fromToken and toToken addresses tuple associated with the passed pairId
     */
    function getPairAddresses(uint pairId) public view returns (address, address) {
        return(reversePairs[pairId].fromToken, reversePairs[pairId].toToken);
    }

    /**
     * @notice Handles removable of existing pair
     * note:
     * - Should only be executed if no live strategies exist for either pair
     * - Deletes pair from 'pairs' mapping
     * - Swaps last pair in 'reversePairs' into index of pair being removed
     * - Points 'pairs' mapping for last pair to new pairId
     * @param fromToken Source token address of pair being removed
     * @param toToken Target token address of pair being removed
     */
    function removePair(address fromToken, address toToken) external onlyOwner {
        require(pairs[fromToken][toToken] > 0, "Pair does not exist");
        uint _pairId = pairs[fromToken][toToken];
        delete pairs[fromToken][toToken];
        uint _lastPairIdx = reversePairs.length - 1;
        reversePairs[_pairId] = reversePairs[_lastPairIdx];
        reversePairs.pop();
        (address _from, address _to) = getPairAddresses(_pairId);
        pairs[_from][_to] = _pairId;
    }

    /**
     * @notice Sets pool path for V3 swapping [TESTING]
     * - in production would be only owner
     */
    function setPath(uint24 pairId, uint24 params,
                     address assetA, uint24 fee1, 
                     address assetB, uint24 fee2, 
                     address assetC, uint24 fee3, 
                     address assetD)
                     public {
        if(params == 5) {
            reversePairs[pairId].path = abi.encodePacked(assetA, fee1, assetB, fee2, assetC);
        } else if (params == 7) {
            reversePairs[pairId].path = abi.encodePacked(assetA, fee1, assetB, fee2, assetC, fee3, assetD);
        }
    }

    /**
     * @notice Sums a purchase slot's purchase order for each asset and returns results in an array
     * @param slot The purchase slot accumulated purchase amounts of target assets are being sought for
     */
    function accumulatePurchaseOrders(uint slot) public view returns (uint[] memory) {
        uint[] memory _totals = new uint[](reversePairs.length);
        for(uint i = 0; i < purchaseOrders[slot].length; i++) {
            _totals[purchaseOrders[slot][i].pairId] += purchaseOrders[slot][i].amount;
        }
        return _totals;
    }

    /**
     * @notice Initiates new dollar cost strategy based on user's configuration
     * @param sourceAsset Deposited asset the user's strategy will use to fund future purchases
     * @param targetAsset Asset the user's strategy will be purchasing
     * @param sourceBalance Deposit amount of the source asset
     * @param interval Defines daily cadence of target asset purchases
     * @param purchaseAmount Defines amount to be purchased at each interval
     * note: Population of the purchaseOrders mapping uses 1-based indexing to initialize 
     * strategy at first interval.
     */
    function initiateNewStrategy(address sourceAsset, address targetAsset, uint sourceBalance, uint interval, uint purchaseAmount) public {
        uint _pairId = pairs[sourceAsset][targetAsset];
        require(_pairId > 0, "Pair does not exist");
        require(accounts[msg.sender][_pairId].purchasesRemaining == 0, "Existing strategy");
        require(interval == 1 || interval == 7 || interval == 14 || interval == 21 || interval == 30, "Unsupported interval");
        depositSource(sourceAsset, sourceBalance);

        // Incur fee
        uint _balance = sourceBalance;
        if(fee > 0) {
            _balance = incurFee(sourceAsset, sourceBalance);
        }

        // Calculate purchases remaining and account for remainder purchase amounts
        uint _purchasesRemaining = _balance / purchaseAmount;
        uint _remainder;
        if((_balance % purchaseAmount) > 0) {
            _remainder = _balance - (_purchasesRemaining * purchaseAmount);
            _purchasesRemaining += 1;
        }

        // Target balance carries over if existing user initiates new strategy
        uint _targetBalance = 0;
        if(accounts[msg.sender][_pairId].targetBalance > 0){
            _targetBalance += accounts[msg.sender][_pairId].targetBalance;
        }

        accounts[msg.sender][_pairId] = Strategy(purchaseSlot + interval,
                                                 //_balance,
                                                 0,
                                                 interval,
                                                 purchaseAmount,
                                                 _purchasesRemaining
                                                 );

        // Populate purchaseOrders mapping
        uint _currentSlot = purchaseSlot;
        for(uint i = 1; i <= _purchasesRemaining; i++) {
            uint _purchaseSlot = _currentSlot + (interval * i);
            if(_purchasesRemaining == i && _remainder > 0) {
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, _remainder, _pairId));
            } else {
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, purchaseAmount, _pairId));
            }
        }
        emit StrategyInitiated(msg.sender, purchaseSlot + interval);
    }

    /**
     * @notice Tops up users existing strategy with additional units of the source asset
     * @param sourceAsset Deposited asset the user's strategy will use to fund future purchases
     * @param targetAsset Asset the user's strategy will be purchasing
     * @param topUpAmount Defines amount to be purchased at each interval
     * note:
     * - Population of the purchaseOrders mapping uses 0-based indexing to top up an existing
     *   strategy starting at the _slotOffset
     * - Function first checks for a purchaseAmount shortfall in the last purchase slot of the 
     *   user's existing strategy and if one exists, it fills that purchase slot and updates the 
     *   topUpAmount accordingly
     */
    function topUpStrategy(address sourceAsset, address targetAsset, uint topUpAmount) public payable {
        uint _pairId = pairs[sourceAsset][targetAsset];
        require(_pairId > 0, "Pair does not exist");
        require(accounts[msg.sender][_pairId].purchasesRemaining > 0, "No existing strategy for pair");
        depositSource(sourceAsset, topUpAmount);
        
        // Incur fee
        uint _balance = topUpAmount;
        if(fee > 0) {
            _balance = incurFee(sourceAsset, topUpAmount);
        }

        // Calculate offset starting point for top up purchases and ending point for existing purchase shortfalls
        Strategy storage strategy = accounts[msg.sender][_pairId];
        uint _purchaseAmount = strategy.purchaseAmount;
        uint _slotOffset = strategy.nextSlot + (strategy.purchasesRemaining * strategy.interval);
        uint _strategyLastSlot = _slotOffset - strategy.interval;

        // If remainder 'shortfall' below purchaseAmount on final purchase slot of existing strategy, fill
        for(uint i = 0; i < purchaseOrders[_strategyLastSlot].length; i++) {
            if(purchaseOrders[_strategyLastSlot][i].user == msg.sender) {
                if(purchaseOrders[_strategyLastSlot][i].pairId == _pairId) {
                    uint _amountLastSlot = purchaseOrders[_strategyLastSlot][i].amount;
                    if(_amountLastSlot < _purchaseAmount) {
                        if(_balance > (_purchaseAmount - _amountLastSlot)) {
                            _balance -= (_purchaseAmount - _amountLastSlot);
                            purchaseOrders[_strategyLastSlot][i].amount = _purchaseAmount;
                        } else if (_balance < (_purchaseAmount - _amountLastSlot)) {
                            purchaseOrders[_strategyLastSlot][i].amount += _balance;
                            _balance = 0;
                        } else {
                            purchaseOrders[_strategyLastSlot][i].amount = _purchaseAmount;
                            _balance = 0;
                        }
                    }
                    break; // Break once strategy is found
                }
            }
        }

        uint _topUpPurchasesRemaining = _balance / _purchaseAmount;
        uint _remainder;
        if((_balance % _purchaseAmount > 0) && (_topUpPurchasesRemaining > 0)) {
            _remainder = _balance - (_topUpPurchasesRemaining * _purchaseAmount);
            _topUpPurchasesRemaining += 1;
        }

        uint _purchaseSlot = _slotOffset;
        for(uint i = 0; i < _topUpPurchasesRemaining; i++) {
            _purchaseSlot = _slotOffset + (strategy.interval * i);
            if((_topUpPurchasesRemaining - 1) == i && _remainder > 0) {
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, _remainder, _pairId));
            } else {
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, _purchaseAmount, _pairId));
            }
        }
        strategy.purchasesRemaining += _topUpPurchasesRemaining;
        emit StrategyToppedUp(msg.sender, _balance);
    }

    /**
     * @notice Sums a purchase slot's purchase order for each asset and returns results in an array
     * @param token address of ERC20 token to be deposited into contract
     * @param amount amount of ERC20 token to be deposited into contract
     */
    function depositSource(address token, uint256 amount) internal {
        (bool success) = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(success, "Deposit unsuccessful");
        emit Deposited(block.timestamp, msg.sender, amount);
    }

    /**
     * @notice Allows users to withdrawal target asset
     * @param pairId pairId of the strategy user is withdrawing the target asset from
     * @param amount Amount of the target asset the user is withdrawing
     */
    function withdrawTarget(uint pairId, uint amount) external {
        require(accounts[msg.sender][pairId].targetBalance >= amount, "Amount exceeds balance");
        accounts[msg.sender][pairId].targetBalance -= amount;
        (bool success) = IERC20(reversePairs[pairId].toToken).transfer(msg.sender, amount);
        require(success, "Withdrawal unsuccessful");
        emit Withdrawal(msg.sender, amount);
    }

    /**
     * @notice Allows owner to set protocol fee
     * @param _fee Fee value in decimal representation of percent, 0.XX * 10e18
     */
    function setFee(uint _fee) external onlyOwner {
        fee = _fee;
    }

    /**
     * @notice Incurs fee on balance
     * @param balance Balance on which a fee is to be incurred
     * @return The passed balance less the fee incurred
     */
    function incurFee(address sourceAsset, uint balance) internal returns (uint) {
        uint _feeIncurred = balance * fee / 100e18;
        treasury[sourceAsset] += _feeIncurred;
        return balance - _feeIncurred;
    }

    /**
     * @notice Allows owner to set price feed addresses for each token
     * @param token Address of token price feed is being set for
     * @param feed Address of price feed for token
     */
    function setPriceFeed(address token, address feed) external onlyOwner {
        priceFeeds[token] = feed;
    }

    /**
     * @notice Max discount setter
     * @param _maxDiscount New max discount value
     */
    function setMaxDiscount(uint _maxDiscount) external onlyOwner {
         maxDiscount = _maxDiscount;
    }

    /**
     * @notice Treasury mapping getter by source asset
     * @return Treasury balance of source asset
     */
    function getTreasury(address sourceAsset) public view returns (uint) {
        return treasury[sourceAsset];
    }

    /////////////////////////////////////////////////////
    ////////////////////// TESTING //////////////////////
    ///////// PLACEHOLDER KEEPERS & SWAP FUNCTIONS //////

    /**
     * NOTE: [TESTING visibility needs to be changed to INTERNAL post
     */
    function swap(uint pairId, address tokenIn, address tokenOut, uint256 amountIn) public returns (uint256 amountOut) {
        TransferHelper.safeApprove(tokenIn, address(swapRouter), amountIn);
        int _tokenInPrice = getLatestPrice(tokenIn);
        int _tokenOutPrice = getLatestPrice(tokenOut);
        uint amountOutMin = ((amountIn * uint(_tokenInPrice)) / uint(_tokenOutPrice) * maxDiscount) / 100;

        ISwapRouter.ExactInputParams memory params =
            ISwapRouter.ExactInputParams({
                path: reversePairs[pairId].path,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin
            });
        amountOut = swapRouter.exactInput(params);
    }

    /**
     * @notice Chainlink oracle price feed
     * @return the latest price and decimal for the passed token address
     */
    function getLatestPrice(address token) public view returns (int) {
        address _token = priceFeeds[token];
        (
            uint80 roundID, 
            int price,
            uint startedAt,
            uint timeStamp,
            uint80 answeredInRound
        ) = AggregatorV3Interface(_token).latestRoundData();
        require(timeStamp > 0, "Round not complete");
        return price;
    }

    /// @notice [TESTING] placeholder oracle prices for local swap testing
    uint[] public AssetPrices = [0, 2000, 30000, 1]; // null, ETH, BTC, MATIC


    /// @notice [TESTING] checkUpkeep keeper integration placeholder function for testing purposes
    function checkUpkeepTEST() external {
        uint _now = block.timestamp;
        if((_now - lastTimeStamp) > upKeepInterval) {
            performUpkeepTEST();
        }
    }

    /// @notice [TESTING] performUpkeep keeper integration placeholder function for testing purposes
    function performUpkeepTEST() internal {
        uint _now = block.timestamp;
        if((_now - lastTimeStamp) > upKeepInterval) {
            lastTimeStamp = _now;
            uint _pairCount = reversePairs.length;
            uint[] memory _pairTrades = accumulatePurchaseOrders(purchaseSlot);
            uint[] memory _purchased = new uint[](_pairCount);
            for(uint i = 1; i < _pairCount; i++) {
                uint _total = _pairTrades[i];
                if(_total > 0) {
                    /////////////////////////////////////////////////////
                    ////////////////////// TESTING //////////////////////
                    // [SIMULATED LOCAL SWAP]
                    //_purchased[i] += _total / AssetPrices[i];
                    // [FORKED MAINNET SWAP]
                    _purchased[i] = swap(i,
                                         reversePairs[i].fromToken,
                                         reversePairs[i].toToken,
                                         _total);
                    ////////////////////// TESTING //////////////////////
                    /////////////////////////////////////////////////////                    
                }
            }

            uint _purchaseSlot = purchaseSlot;
            for(uint i = 0; i < purchaseOrders[_purchaseSlot].length; i++) {
                address _user = purchaseOrders[_purchaseSlot][i].user;
                uint _pairId = purchaseOrders[_purchaseSlot][i].pairId;
                accounts[_user][_pairId].purchasesRemaining -= 1;
                accounts[_user][_pairId].targetBalance += purchaseOrders[_purchaseSlot][i].amount * 
                                                          _purchased[_pairId] / 
                                                          _pairTrades[_pairId];
                accounts[_user][_pairId].nextSlot = purchaseSlot + accounts[_user][_pairId].interval;
                if(accounts[_user][_pairId].purchasesRemaining == 0) {
                    accounts[_user][_pairId].interval = 0;
                }
            }
            delete purchaseOrders[_purchaseSlot];
        }
        purchaseSlot++;
    }

    ///////// PLACEHOLDER KEEPERS & SWAP FUNCTIONS //////
    ////////////////////// TESTING //////////////////////
    /////////////////////////////////////////////////////

    receive() payable external {}

    /**
    * Built in the depths of the bear market of 2022. Keep building friends.
    */
}