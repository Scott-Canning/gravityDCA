//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

interface IUniswapV2Router {
  function getAmountsOut(uint256 amountIn, address[] memory path) external view returns (uint256[] memory amounts);
  function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts);
}

/**
 * @notice Implementation of the Gravity Strategy Factory contract. Handles pair accounting, 
 * strategy initiation, strategy topping up, keeper automation, swapping, and target
 * withdrawal.
 */
contract StrategyFactory is Ownable {
    /// @notice [TESTING] boolean for conditional checks on testing environment
    bool public localTesting = true;

    /// @notice Time delta that must be satisfied for checkUpkeep to evaluate true (60 * 60 * 24)
    uint public immutable upKeepInterval;

    /// @notice Counter abstraction used to index the current day's purchase orders and schedule future purchase orders 
    uint public purchaseSlot;

    /// @notice Timestamp of last fully execute performUpkeep used to maintain daily upkeep cadence
    uint public lastTimeStamp;

    /// @notice Ensures all pairId swaps are evaluated before incrementing the purchase slot and lastTimeStamp
    uint public swapIndex = 1;
    
    /// @notice Tracks timestamp when swapIndex=1 to maintain earliest lastTimeStamp value when swapIndex=reversePairs.length
    uint public firstTimeStamp;

    /// @notice Treasury service fee
    uint public fee;

    /// @notice ( 100 - slippageFactor ) gives global swap slippage tolerance
    uint public slippageFactor = 99;

    /// @notice Defines minimum purchase amount per interval for initiating new strategies and topping up existing strategies
    uint public minPurchaseAmount = 100e18;
    
    /// @notice V2 swap router
    IUniswapV2Router public immutable swapRouterV2 = IUniswapV2Router(0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff);

    /// @notice Oracle price feed
    AggregatorV3Interface internal priceFeed;

    /**
    * @notice Mapping of each user's live strategy for each respective asset 
    * ( user address => ( strategy pairId => strategy configuration ) )
    */ 
    mapping (address => mapping (uint => Strategy)) public accounts;
    
    /**
    * @notice Mapping for each purchase slot's purchase order array
    * ( day's purchase slot => (pairId => array of purchase orders ) )
    */     
    mapping (uint => mapping(uint => PurchaseOrder[])) public purchaseOrders;

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
    }

    event StrategyInitiated(address account, uint nextPurchaseSlot);
    event StrategyToppedUp(address account, uint topUpPurchaseSlot);
    event Deposited(uint timestamp, address from, uint sourceDeposited);
    event Withdrawal(address account, uint amount);

    /// @notice Set Keepers upkeep interval, last timestamp, 1-base pairId (avoid default mapping value)
    constructor(uint _upKeepInterval) {
        upKeepInterval = _upKeepInterval;
        lastTimeStamp = block.timestamp;
        reversePairs.push(Pair(address(0), address(0)));
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
     * @param pairId The pairId for which details are being sought
     * @return PurchaseOrder Array containing all purchase orders of the passed purchase slot
     */
    function getPurchaseOrderDetails(uint slot, uint pairId) public view returns (PurchaseOrder[] memory) {
        return purchaseOrders[slot][pairId];
    }

    /**
     * @notice Calculates purchase order schedule for user's strategy of passed pairId 
     * @param user Address of user schedule is being sought for
     * @param pairId PairId of strategy schedule is being sought for
     */
    function getPurchaseSchedule(address user, uint pairId) public view returns (uint256[] memory, uint256[] memory) {
        uint nextslot = accounts[user][pairId].nextSlot;
        uint interval = accounts[user][pairId].interval;
        uint purchasesRemaining = accounts[user][pairId].purchasesRemaining;

        uint[] memory purchaseSlots = new uint[](purchasesRemaining);
        uint[] memory purchaseAmounts = new uint[](purchasesRemaining);

        for(uint i = 0; i < purchasesRemaining; i++) {
            uint _nextSlot = nextslot + (interval * i);
            purchaseSlots[i] = _nextSlot;
            for(uint k = 0; k < purchaseOrders[_nextSlot][pairId].length; k++){
                if(purchaseOrders[_nextSlot][pairId][k].user == user){
                    purchaseAmounts[i] = purchaseOrders[_nextSlot][pairId][k].amount;
                    break;
                }
            }
        }
        return(purchaseSlots, purchaseAmounts);
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
        reversePairs.push(Pair(fromToken, toToken));
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
     * @notice Price fee getter
     * @param token Address of token price feed address is being sought for
     * @return Price feed address for token
     */
    function getPriceFeed(address token) public view returns (address) {
        return priceFeeds[token];
    }

    /**
     * @notice Max slippage setter
     * @param _slippageFactor New slippage factor value
     */
    function setSlippageFactor(uint _slippageFactor) external onlyOwner {
         slippageFactor = _slippageFactor;
    }

    /**
     * @notice Min purchase amount setter
     * @param _minPurchaseAmount New min purchase amount value
     */
    function setMinPurchaseAmount(uint _minPurchaseAmount) external onlyOwner {
         minPurchaseAmount = _minPurchaseAmount;
    }

    /**
     * @notice Sums a purchase slot's purchase order for pairId and returns result
     * @param slot The purchase slot accumulated purchase amounts are being sought for
     * @param pairId The pairId accumulated purchase amounts are being sought for
     * @return total Sum of all purchase orders for the purchase slot
     */
    function accumulatePurchaseOrders(uint slot, uint pairId) public view returns (uint total) {
        for(uint i = 0; i < purchaseOrders[slot][pairId].length; i++) {
            total += purchaseOrders[slot][pairId][i].amount;
        }
        return total;
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

        // [TESTING]
        if(!localTesting) {
            int sourceUSD = getLatestPrice(sourceAsset);
            uint purchaseAmountUSD = uint(sourceUSD) * purchaseAmount / 1e8;
            require(purchaseAmountUSD >= minPurchaseAmount, "Purchase amount below minimum");
        }

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
                                                 _targetBalance,
                                                 interval,
                                                 purchaseAmount,
                                                 _purchasesRemaining
                                                 );

        // Populate purchaseOrders mapping
        uint _currentSlot = purchaseSlot;
        for(uint i = 1; i <= _purchasesRemaining; i++) {
            uint _purchaseSlot = _currentSlot + (interval * i);
            if(_purchasesRemaining == i && _remainder > 0) {
                purchaseOrders[_purchaseSlot][_pairId].push(PurchaseOrder(msg.sender, _remainder, _pairId));
            } else {
                purchaseOrders[_purchaseSlot][_pairId].push(PurchaseOrder(msg.sender, purchaseAmount, _pairId));
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
    function topUpStrategy(address sourceAsset, address targetAsset, uint topUpAmount) public {
        uint _pairId = pairs[sourceAsset][targetAsset];
        require(_pairId > 0, "Pair does not exist");
        require(accounts[msg.sender][_pairId].purchasesRemaining > 0, "No existing strategy for pair");
        depositSource(sourceAsset, topUpAmount);

        Strategy storage strategy = accounts[msg.sender][_pairId];
        uint _purchaseAmount = strategy.purchaseAmount;

        // [TESTING] mainnet fork only
        if(!localTesting) {
            int sourceUSD = getLatestPrice(sourceAsset);
            uint purchaseAmountUSD = uint(sourceUSD) * _purchaseAmount / 1e8;
            require(purchaseAmountUSD >= minPurchaseAmount, "Purchase amount below minimum");
        }

        // Incur fee
        uint _balance = topUpAmount;
        if(fee > 0) {
            _balance = incurFee(sourceAsset, topUpAmount);
        }

        // Calculate offset starting point for top up purchases and ending point for existing purchase shortfalls
        uint _slotOffset = strategy.nextSlot + (strategy.purchasesRemaining * strategy.interval);
        uint _strategyLastSlot = _slotOffset - strategy.interval;

        // If remainder 'shortfall' below purchaseAmount on final purchase slot of existing strategy, fill
        for(uint i = 0; i < purchaseOrders[_strategyLastSlot][_pairId].length; i++) {
            if(purchaseOrders[_strategyLastSlot][_pairId][i].user == msg.sender) {
                uint _amountLastSlot = purchaseOrders[_strategyLastSlot][_pairId][i].amount;
                if(_amountLastSlot < _purchaseAmount) {
                    if(_balance > (_purchaseAmount - _amountLastSlot)) {
                        _balance -= (_purchaseAmount - _amountLastSlot);
                        purchaseOrders[_strategyLastSlot][_pairId][i].amount = _purchaseAmount;
                    } else if (_balance < (_purchaseAmount - _amountLastSlot)) {
                        purchaseOrders[_strategyLastSlot][_pairId][i].amount += _balance;
                        _balance = 0;
                    } else {
                        purchaseOrders[_strategyLastSlot][_pairId][i].amount = _purchaseAmount;
                        _balance = 0;
                    }
                }
                break; // Break once user's purchase order is found
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
                purchaseOrders[_purchaseSlot][_pairId].push(PurchaseOrder(msg.sender, _remainder, _pairId));
            } else {
                purchaseOrders[_purchaseSlot][_pairId].push(PurchaseOrder(msg.sender, _purchaseAmount, _pairId));
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
     * @notice Allows users to withdraw target asset
     * @param pairId pairId of the strategy user is withdrawing the target asset from
     * @param amount Amount of the target asset the user is withdrawing
     * note:
     * - deletes stored strategy details if user withdraws full target balance
     */
    function withdrawTarget(uint pairId, uint amount) external {
        uint _balance = accounts[msg.sender][pairId].targetBalance;
        require(_balance >= amount, "Amount exceeds balance");
        accounts[msg.sender][pairId].targetBalance -= amount;
        (bool success) = IERC20(reversePairs[pairId].toToken).transfer(msg.sender, amount);
        require(success, "Withdrawal unsuccessful");
        if(_balance == amount) {
            delete accounts[msg.sender][pairId];
        }
        emit Withdrawal(msg.sender, amount);
    }

    /**
     * @notice Treasury mapping getter by source asset
     * @return Treasury balance of source asset
     */
    function getTreasury(address sourceAsset) public view returns (uint) {
        return treasury[sourceAsset];
    }

    /**
     * @notice Allows governing contract to withdraw treasury assets
     * @param token Address of token to be withdrawn
     * @param amount Amount to be withdrawn
     */
    function withdrawTreasury(address token, uint amount) external onlyOwner {
        require(treasury[token] >= amount, "Amount exceeds balance");
        treasury[token] -= amount;
        (bool success) = IERC20(token).transfer(msg.sender, amount);
        require(success, "Withdrawal unsuccessful");
    }

    /**
     * @notice Swap function
     * @param tokenIn Source token funding swap
     * @param tokenOut Target target received from swap
     * @param amountIn Amount of source token to be swapped
     * @return amountOut Amount of target token received after swap
     */
    function swap(address tokenIn, address tokenOut, uint256 amountIn) internal returns (uint256 amountOut) {      
        IERC20(tokenIn).approve(address(swapRouterV2), amountIn);
        int _tokenInPrice = getLatestPrice(tokenIn);
        int _tokenOutPrice = getLatestPrice(tokenOut);
        uint amountOutMin = ((amountIn * uint(_tokenInPrice)) / uint(_tokenOutPrice) * slippageFactor) / 100;

        address WETH = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
        address[] memory path;
        if (tokenIn == WETH || tokenOut == WETH) {
            path = new address[](2);
            path[0] = tokenIn;
            path[1] = tokenOut;
        } else {
            path = new address[](3);
            path[0] = tokenIn;
            path[1] = WETH;
            path[2] = tokenOut;
        }
        uint[] memory amounts = swapRouterV2.swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), block.timestamp);
        return amounts[1];
    }

    /**
     * @notice Chainlink oracle price feed
     * @param token The address of the token a price is being sought for
     * @return price The latest price for the passed token address
     */
    function getLatestPrice(address token) public view returns (int price) {
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

    /////////////////////////////////////////////////////
    ////////////////////// TESTING //////////////////////
    ////////////// MOCK KEEPERS FUNCTIONS ///////////////

    /// @notice [TESTING] mock oracle prices for local swap testing
    uint[] public AssetPrices = [0, 2000, 30000, 1]; // null, ETH, BTC, MATIC


    /// @notice [TESTING] checkUpkeep keeper integration placeholder function for testing purposes
    function checkUpkeepTEST(uint _pairId /* bytes calldata checkData */) external  {
        require(_pairId > 0 && _pairId < reversePairs.length, "Pair does not exist");
        if((block.timestamp - lastTimeStamp) > upKeepInterval) {
            uint _purchaseAmount = accumulatePurchaseOrders(purchaseSlot, _pairId);
            performUpkeepTEST(_pairId, _purchaseAmount);

            ///////////////// REGISTERED UPKEEP /////////////////
            // returns (bool upkeepNeeded, bytes memory performData)
            // upkeepNeeded = true;
            // uint _pairId = abi.decode(checkData, (uint));
            // performData = abi.encode(_pairId, _purchaseAmount);
            // return (upkeepNeeded, performData);
            /////////////////////////////////////////////////////
        }
    }

    /// @notice [TESTING] performUpkeep keeper integration placeholder function for testing purposes
    function performUpkeepTEST(uint _pairId, uint _purchaseAmount) internal {
        require(_pairId > 0 && _pairId < reversePairs.length, "Pair does not exist");
        if ((block.timestamp - lastTimeStamp) > upKeepInterval) {
            if(swapIndex == 1) {
                firstTimeStamp = block.timestamp;
            }
            uint _purchaseAmountCheck = accumulatePurchaseOrders(purchaseSlot, _pairId);
            require(_purchaseAmountCheck == _purchaseAmount, "Purchase amount invalid");
            ///////////////// REGISTERED UPKEEP /////////////////
            // (uint _pairId, uint _purchaseAmount) = abi.decode(performData, (uint, uint));
            /////////////////////////////////////////////////////
            uint _purchased;
            if(_purchaseAmount > 0) {
                /////////////////////////////////////////////////////
                ////////////////////// TESTING //////////////////////
                if(localTesting) { // [SIMULATED LOCAL SWAP]
                   _purchased += _purchaseAmount / AssetPrices[_pairId];
                } else {           // [FORKED MAINNET V2 SWAP]
                    _purchased = swap(reversePairs[_pairId].fromToken,
                                      reversePairs[_pairId].toToken,
                                      _purchaseAmount);
                }
                ////////////////////// TESTING //////////////////////
                /////////////////////////////////////////////////////                    
                uint _purchaseSlot = purchaseSlot;
                for(uint i = 0; i < purchaseOrders[_purchaseSlot][_pairId].length; i++) {
                    address _user = purchaseOrders[_purchaseSlot][_pairId][i].user;
                    accounts[_user][_pairId].purchasesRemaining -= 1;
                    accounts[_user][_pairId].targetBalance += purchaseOrders[_purchaseSlot][_pairId][i].amount * 
                                                              _purchased / 
                                                              _purchaseAmount;
                    accounts[_user][_pairId].nextSlot = purchaseSlot + accounts[_user][_pairId].interval;
                    if(accounts[_user][_pairId].purchasesRemaining == 0) {
                        accounts[_user][_pairId].interval = 0;
                    }
                }
            }
            swapIndex++;
            delete purchaseOrders[purchaseSlot][_pairId];
            if(swapIndex == reversePairs.length) {
                lastTimeStamp = firstTimeStamp;
                swapIndex = 1;
                purchaseSlot++;
            }
        }
    }

    ////////////// MOCK KEEPERS FUNCTIONS ///////////////
    ////////////////////// TESTING //////////////////////
    /////////////////////////////////////////////////////

    receive() payable external {}

    /**
    * Built in the depths of the 2022 bear market. Keep building friends.
    */
}