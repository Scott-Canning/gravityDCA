//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
/// @dev [TESTING]
import "hardhat/console.sol";

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
    uint public treasury;
    
    /// @notice pool fee set to 0.3%
    uint24 public constant poolFee = 3000;                      
    ISwapRouter public immutable swapRouter = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

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
    Pairs[] public reversePairs;

    /// @notice Data type used for slotting a user's future purchase orders
    struct PurchaseOrder {
        address         user;
        uint            amount;
        uint            pairId;
    }

    /// @notice Data type used for tracking a user's current DCA strategy
    struct Strategy {
        uint            nextSlot;
        uint            sourceBalance;
        uint            targetBalance;
        uint            interval;
        uint            purchaseAmount;
        uint            purchasesRemaining;
    }

    struct Pairs {
        address         fromToken;
        address         toToken;
    }

    event StrategyInitiated(address account, uint nextPurchaseSlot);
    event StrategyToppedUp(address account, uint topUpPurchaseSlot);
    event Deposited(uint timestamp, address from, uint sourceDeposited);
    event Withdrawal(address account, uint amount);

    /// @notice Set Keepers upkeep interval, last timestamp, 1-base pairId
    constructor(uint _upKeepInterval) {
        upKeepInterval = _upKeepInterval;
        lastTimeStamp = block.timestamp;
        // pairIds are 1-based to avoid default mapping value
        reversePairs.push(Pairs(address(0), address(0)));
    }

    /**
     * @notice 'accounts' nested mapping getter
     * @param _user Address of user account
     * @param _pairId Strategy pairId of the source and target assets
     * @return Strategy struct mapped from user's address and strategy pairId
     */
    function getStrategyDetails(address _user, uint _pairId) public view returns (Strategy memory) {
        return accounts[_user][_pairId];
    }

    /**
     * @notice 'purchaseOrders' mapping getter
     * @param _slot The purchase slot for which details are being sought
     * @return PurchaseOrder array containing all purchase orders of the passed purchase slot
     */
    function getPurchaseOrderDetails(uint _slot) public view returns (PurchaseOrder[] memory) {
        return purchaseOrders[_slot];
    }

    /**
     * @notice Enables new strategy pairing
     * @param _fromToken token that funds _toToken purchase
     * @param _toToken token that gets purchased with _fromToken
     */
    function setPair(address _fromToken, address _toToken) public onlyOwner {
        require(pairs[_fromToken][_toToken] == 0, "Pair exists");
        uint _pairId = reversePairs.length;
        pairs[_fromToken][_toToken] = _pairId;
        reversePairs.push(Pairs(_fromToken, _toToken));
    }

    /**
     * @notice 'pairId' getter
     * @param _fromToken Token address that funds _toToken purchase
     * @param _toToken Token address that gets purchased with _fromToken
     */
    function getPairId(address _fromToken, address _toToken) public view returns (uint) {
        return pairs[_fromToken][_toToken];
    }

    /**
     * @notice Pair's addresses getter
     * @param _pairId pairId of the pair's addresses being sought
     * @return fromToken and toToken addresses tuple associated with the passed pairId
     */
    function getPairAddresses(uint _pairId) public view returns (address, address) {
        return(reversePairs[_pairId].fromToken, reversePairs[_pairId].toToken);
    }

    /**
     * @notice Handles removable of existing pair
     * note:
     * - Should only be executed if no live strategies exist for either pair
     * - Deletes pair from 'pairs' mapping
     * - Swaps last pair in 'reversePairs' into index of pair being removed
     * - Points 'pairs' mapping for last pair to new pairId
     * @param _fromToken source token address of pair being removed
     * @param _toToken target token address of pair being removed
     */
    function removePair(address _fromToken, address _toToken) public onlyOwner {
        require(pairs[_fromToken][_toToken] > 0, "Pair does not exist");
        uint _pairId = pairs[_fromToken][_toToken];
        delete pairs[_fromToken][_toToken];
        uint _lastPairIdx = reversePairs.length - 1;
        reversePairs[_pairId] = reversePairs[_lastPairIdx];
        reversePairs.pop();
        (address _from, address _to) = getPairAddresses(_pairId);
        pairs[_from][_to] = _pairId;
    }

    /**
     * @notice Sums a purchase slot's purchase order for each asset and returns results in an array
     * @param _slot the purchase slot accumulated purchase amounts of target assets are being sought for
     */
    function accumulatePurchaseOrders(uint _slot) public view returns (uint[] memory) {
        uint[] memory _totals = new uint[](reversePairs.length);
        for(uint i = 0; i < purchaseOrders[_slot].length; i++) {
            _totals[purchaseOrders[_slot][i].pairId] += purchaseOrders[_slot][i].amount;
        }
        return _totals;
    }

    /**
     * @notice Initiates new DCA strategy based on user's configuration
     * @param _sourceAsset deposited asset the user's strategy will use to fund future purchases
     * @param _targetAsset asset the user's strategy will be purchasing
     * @param _sourceBalance deposit amount of the source asset
     * @param _interval defines daily cadence of target asset purchases
     * @param _purchaseAmount defines amount to be purchased at each interval
     * note: Population of the purchaseOrders mapping uses 1-based indexing to initialize 
     * strategy at first interval.
     */
    function initiateNewStrategy(address _sourceAsset, address _targetAsset, uint _sourceBalance, uint _interval, uint _purchaseAmount) public payable {
        uint _pairId = pairs[_sourceAsset][_targetAsset];
        require(_pairId > 0, "Pair does not exist");
        require(accounts[msg.sender][_pairId].purchasesRemaining == 0, "Existing strategy");
        require(_interval == 1 || _interval == 7 || _interval == 14 || _interval == 21 || _interval == 30, "Unsupported interval");
        depositSource(_sourceAsset, _sourceBalance);

        // Incur fee
        uint _balance = _sourceBalance;
        if(fee > 0) _balance = incurFee(_sourceBalance);

        // Calculate purchases remaining and account for remainder purchase amounts
        uint _purchasesRemaining = _balance / _purchaseAmount;
        uint _remainder;
        if((_balance % _purchaseAmount) > 0) {
            _remainder = _balance - (_purchasesRemaining * _purchaseAmount);
            _purchasesRemaining += 1;
        }

        // Target balance carries over if existing user initiates new strategy
        uint _targetBalance = 0;
        if(accounts[msg.sender][_pairId].targetBalance > 0){
            _targetBalance += accounts[msg.sender][_pairId].targetBalance;
        }

        accounts[msg.sender][_pairId] = Strategy(purchaseSlot + _interval,
                                                 _balance,
                                                 0,
                                                 _interval,
                                                 _purchaseAmount,
                                                 _purchasesRemaining
                                                 );

        // Populate purchaseOrders mapping
        uint _currentSlot = purchaseSlot;
        for(uint i = 1; i <= _purchasesRemaining; i++) {
            uint _purchaseSlot = _currentSlot + (_interval * i);
            if(_purchasesRemaining == i && _remainder > 0) {
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, _remainder, _pairId));
            } else {
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, _purchaseAmount, _pairId));
            }
        }
        accounts[msg.sender][_pairId].sourceBalance = 0;
        emit StrategyInitiated(msg.sender, purchaseSlot + _interval);
    }

    /**
     * @notice Tops up uses existing strategy with additional units of the source asset
     * @param _sourceAsset deposited asset the user's strategy will use to fund future purchases
     * @param _targetAsset asset the user's strategy will be purchasing
     * @param _topUpAmount defines amount to be purchased at each interval
     * note:
     * - Population of the purchaseOrders mapping uses 0-based indexing to top up an existing
     *   strategy starting at the _slotOffset
     * - Function first checks for a purchaseAmount shortfall in the last purchase slot of the 
     *   user's existing strategy and if one exists, it fills that purchase slot and updates the 
     *   _topUpAmount accordingly
     */
    function topUpStrategy(address _sourceAsset, address _targetAsset, uint _topUpAmount) public payable {
        uint _pairId = pairs[_sourceAsset][_targetAsset];
        require(_pairId > 0, "Pair does not exist");
        require(accounts[msg.sender][_pairId].purchasesRemaining > 0, "No existing strategy for pair");
        depositSource(_sourceAsset, _topUpAmount);
        accounts[msg.sender][_pairId].sourceBalance += _topUpAmount;

        // Incur fee
        uint _balance = _topUpAmount;
        if(fee > 0) _balance = incurFee(_topUpAmount);

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
        strategy.sourceBalance = 0;
        strategy.purchasesRemaining += _topUpPurchasesRemaining;
        emit StrategyToppedUp(msg.sender, _balance);
    }

    /**
     * @notice Sums a purchase slot's purchase order for each asset and returns results in an array
     * @param _token [COMPLETE]
     * @param _amount [COMPLETE]
     */
    function depositSource(address _token, uint256 _amount) internal {
        (bool success) = IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        require(success, "Deposit unsuccessful");
        emit Deposited(block.timestamp, msg.sender, _amount);
    }

    /**
     * @notice Allows users to withdrawal target asset
     * @param _pairId pairId of the strategy user is withdrawing the target asset from
     * @param _amount Amount of the target asset the user is withdrawing
     */
    function withdrawTarget(uint _pairId, uint _amount) external {
        require(accounts[msg.sender][_pairId].targetBalance >= _amount, "Amount exceeds balance");
        accounts[msg.sender][_pairId].targetBalance -= _amount;
        (bool success) = IERC20(reversePairs[_pairId].toToken).transfer(msg.sender, _amount);
        require(success, "Withdrawal unsuccessful");
        emit Withdrawal(msg.sender, _amount);
    }

    /**
     * @notice Allows owner to set protocol fee
     * @param _fee Fee value in decimal representation of percent, 0.XX * 10e18
     */
    function setFee(uint _fee) public onlyOwner {
        fee = _fee;
    }

    /**
     * @notice Incurs fee on balance
     * @param _balance Balance on which a fee is to be incurred
     * @return The passed balance less the fee incurred
     */
    function incurFee(uint _balance) internal returns (uint) {
        uint _feeIncurred = _balance * fee / 100e18;
        treasury += _feeIncurred;
        return _balance - _feeIncurred;
    }


    /////////////////////////////////////////////////////
    ////////////////////// TESTING //////////////////////
    ///////// PLACEHOLDER KEEPERS & SWAP FUNCTIONS //////

    function swap(address _tokenIn, address _tokenOut, uint256 _amountIn, uint256 _amountOutMin) internal returns (uint256 amountOut) {
        // approve router to spend tokenIn
        TransferHelper.safeApprove(_tokenIn, address(swapRouter), _amountIn);

        // naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum
        // set sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: _tokenIn,
                tokenOut: _tokenOut,
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: _amountIn,
                amountOutMinimum: _amountOutMin,
                sqrtPriceLimitX96: 0
            });

        // execute the swap
        amountOut = swapRouter.exactInputSingle(params);
    }

    /// @notice [TESTING] placeholder oracle prices for test swapping
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
                    _purchased[i] += _total / AssetPrices[i];

                    // [FORKED MAINNET SWAP]
                    // _purchased[i][j] = swap(reversePairs[i].fromToken, 
                    //                         reversePairs[i].toToken,
                    //                         _total,
                    //                         0);

                    //delete _totals[reverseSourceTokens.get(i)][reverseTargetTokens.get(j)];
                    ////////////////////// TESTING //////////////////////
                    /////////////////////////////////////////////////////
                    
                }
            }

            // Handle accounting for purchased asset for each user
            for(uint i = 0; i < purchaseOrders[purchaseSlot].length; i++) {
                address _user = purchaseOrders[purchaseSlot][i].user;
                uint _pairId = purchaseOrders[purchaseSlot][i].pairId;
                // Decrement purchases remaining
                accounts[_user][_pairId].purchasesRemaining -= 1;
                // Increment user's pro-rata share of the total purchase amount of the target asset
                accounts[_user][_pairId].targetBalance += purchaseOrders[purchaseSlot][i].amount * 
                                                          _purchased[_pairId] / 
                                                          _pairTrades[_pairId];
                // Update strategy's next slot
                accounts[_user][_pairId].nextSlot = purchaseSlot + accounts[_user][_pairId].interval;
                // [MAY NOT BE NECESSARY - DELETE INSTEAD?] set interval to 0 if purchasesRemaining === 0; 
                if(accounts[_user][_pairId].purchasesRemaining == 0) {
                    accounts[_user][_pairId].interval = 0;
                }
            }
            // Delete purchaseOrder post swap to redeem gas
            delete purchaseOrders[purchaseSlot];
        }
        purchaseSlot++;
    }

    ///////// PLACEHOLDER KEEPERS & SWAP FUNCTIONS //////
    ////////////////////// TESTING //////////////////////
    /////////////////////////////////////////////////////

    /**
    * Built in the depths of the bear market of 2022. Keep building friends.
    */
}