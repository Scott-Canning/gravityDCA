//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @dev [TESTING]
import "hardhat/console.sol";

/**
 * @notice Implementation of the Gravity Strategy Factory contract. Handles 
 * strategy initiation, accounting, keeper automation, and daily batch swapping.
 */
contract StrategyFactory is Ownable {
    using EnumerableMap for EnumerableMap.AddressToUintMap;
    using EnumerableMap for EnumerableMap.UintToAddressMap;

    uint public purchaseSlot;
    uint public lastTimeStamp;
    uint public immutable upKeepInterval;
    uint public fee;
    uint public treasury;

    /**
    * @notice Mapping of each user's live strategy for each respective asset 
    * ( user account => ( target asset => strategy configuration ) )
    */ 
    mapping (address => mapping (address => Strategy)) public accounts;
    
    /**
    * @notice Mapping for each purchase slot's purchase order array
    * ( day's purchase slot => purchase order array )
    */     
    mapping (uint => PurchaseOrder[]) public purchaseOrders;

    /**
    * @notice Forward and reverse enumerable mappings for available source and target tokens
    * note: Enumerable mappings are used to allow iteration for modular, multi-asset 
    * swapping, length method allows proper index assignment for new assets, and fixed memory
    * array sizing
    */ 
    EnumerableMap.AddressToUintMap private sourceTokens;
    EnumerableMap.UintToAddressMap private reverseSourceTokens;
    EnumerableMap.AddressToUintMap private targetTokens;
    EnumerableMap.UintToAddressMap private reverseTargetTokens;

    /// @notice Data type used for slotting a user's future purchase orders
    struct PurchaseOrder {
        address         user;
        uint            amount;
        address         asset;
    }

    /// @notice Data type used for tracking a user's current DCA strategy
    struct Strategy {
        uint            nextSlot;
        // address         sourceAsset;
        address         targetAsset;
        uint            sourceBalance;
        uint            targetBalance;
        uint            interval;
        uint            purchaseAmount;
        uint            purchasesRemaining;
    }

    event StrategyInitiated(address account, uint nextPurchaseSlot);
    event StrategyToppedUp(address account, uint topUpPurchaseSlot);
    event Deposited(uint timestamp, address from, uint sourceDeposited);
    event Withdrawal(address account, uint amount);

    /// @notice Set Keepers upkeep interval, and last timestamp
    constructor(uint _upKeepInterval) {
        upKeepInterval = _upKeepInterval;
        lastTimeStamp = block.timestamp;
    }

    /**
     * @notice 'accounts' nested mapping getter
     * @param _user the address of user account
     * @param _targetAsset the address of the strategy's target asset
     * @return Strategy struct mapped from user's address and a target asset address
     */
    function getStrategyDetails(address _user, address _targetAsset) public view returns (Strategy memory) {
        return accounts[_user][_targetAsset];
    }

    /**
     * @notice 'purchaseOrders' mapping getter
     * @param _slot the purchase slot details are being sought for
     * @return PurchaseOrder array containing all purchase orders of the passed purchase slot
     */
    function getPurchaseOrderDetails(uint _slot) public view returns (PurchaseOrder[] memory) {
        return purchaseOrders[_slot];
    }

    /**
     * @notice 'sourceTokens and reverseSourceTokens' combined setters
     * @param _token the token address the owner seeks to add to the enumerated source token mappings
     */
    function setSourceToken(address _token) public onlyOwner {
        require(sourceTokens.contains(_token) == false, "Token address already present in sourceTokens");
        uint _index = sourceTokens.length();
        require(reverseSourceTokens.contains(_index) == false, "Token index already present in reverseSourceTokens");
        sourceTokens.set(_token, _index);
        reverseSourceTokens.set(_index, _token);
    }

    /**
     * @notice 'sourceTokens' enumerable mapping getter
     * @param _token the address of the source token an index is being sought for
     * @return the index of the source token in the enumerated source tokens mapping
     */
    function getSourceTokenIdx(address _token) public view returns (uint) {
        return sourceTokens.get(_token);
    }

    /**
     * @notice 'reverseSourceTokens' enumerable mapping getter
     * @param _index the index of the source token an address is being sought for
     * @return the address of the source token in the enumerated source tokens mapping
     */
    function getSourceTokenAddr(uint _index) public view returns (address) {
        return reverseSourceTokens.get(_index);
    }

    /**
     * @notice 'targetTokens and reverseTargetTokens' combined setters
     * @param _token the token address the owner seeks to add to the enumerated target token mappings
     */
    function setTargetToken(address _token) public onlyOwner {
        require(targetTokens.contains(_token) == false, "Token address already present in targetTokens");
        uint _index = targetTokens.length();
        require(reverseTargetTokens.contains(_index) == false, "Token index already present in reverseTargetTokens");
        targetTokens.set(_token, _index);
        reverseTargetTokens.set(_index, _token);
    }

    /**
     * @notice 'targetTokens' enumerable mapping getter
     * @param _token the address of the target token an index is being sought for
     * @return the index of the target token in the enumerated target tokens mapping
     */
    function getTargetTokenIdx(address _token) public view returns (uint) {
        return targetTokens.get(_token);
    }

    /**
     * @notice 'reverseTargetTokens' enumerable mapping getter
     * @param _index the index of the target token an address is being sought for
     * @return the address of the target token in the enumerated target tokens mapping
     */
    function getTargetTokenAddr(uint _index) public view returns (address) {
        return reverseTargetTokens.get(_index);
    }

    /**
     * @notice Sums a purchase slot's purchase order for each asset and returns results in an array
     * @param _slot the purchase slot accumulated purchase amounts of target assets are being sought for
     * @return an array of total purchase amounts for a purchase slot where each index corresponds 
     * to the target asset's respective target token index
     */
    function accumulatePurchaseOrders(uint _slot) public view returns (uint[] memory) {
        uint[] memory _total = new uint[](targetTokens.length());
        for(uint i = 0; i < purchaseOrders[_slot].length; i++) {
            _total[targetTokens.get(purchaseOrders[_slot][i].asset)] += purchaseOrders[_slot][i].amount;
        }
        return _total;
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
        require(accounts[msg.sender][_targetAsset].purchasesRemaining == 0, "Account has existing strategy for target asset");
        require(sourceTokens.contains(_sourceAsset) == true && targetTokens.contains(_targetAsset) == true, "Unsupported asset type");
        require(_sourceBalance > 0, "Insufficient deposit amount");
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
        if(accounts[msg.sender][_targetAsset].targetBalance > 0){
            _targetBalance += accounts[msg.sender][_targetAsset].targetBalance;
        }

        accounts[msg.sender][_targetAsset] = Strategy(purchaseSlot + _interval,
                                                      _targetAsset,
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
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, 
                                                                 _remainder, 
                                                                 _targetAsset));
            } else {
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, 
                                                                 _purchaseAmount, 
                                                                 _targetAsset));
            }
        }
        accounts[msg.sender][_targetAsset].sourceBalance = 0;
        emit StrategyInitiated(msg.sender, purchaseSlot + _interval);
    }

    /**
     * @notice Allows users to top up an existing strategy with additional units of the source asset
     * @param _sourceAsset [COMPLETE]
     * @param _targetAsset [COMPLETE]
     * @param _topUpAmount [COMPLETE]
     * note:
     * - Population of the purchaseOrders mapping uses 0-based indexing to top up an existing
     *   strategy starting at the _slotOffset
     * - Function first checks for a purchaseAmount shortfall in the last purchase slot of the 
     *   user's existing strategy and if one exists, it fills that purchase slot and updates the 
     *   _topUpAmount accordingly
     */
    function topUpStrategy(address _sourceAsset, address _targetAsset, uint _topUpAmount) public payable {
        require(accounts[msg.sender][_targetAsset].purchasesRemaining > 0, "Account does not have existing strategy for target asset");
        require(sourceTokens.contains(_sourceAsset) == true && targetTokens.contains(_targetAsset) == true, "Unsupported asset type");
        require(_topUpAmount > 0, "Insufficient deposit amount");
        depositSource(_sourceAsset, _topUpAmount);
        accounts[msg.sender][_targetAsset].sourceBalance += _topUpAmount;

        // Incur fee
        uint _balance = _topUpAmount;
        if(fee > 0) _balance = incurFee(_topUpAmount);

        // Calculate offset starting point for top up purchases and ending point for existing purchase shortfalls
        Strategy storage strategy = accounts[msg.sender][_targetAsset];
        uint _purchaseAmount = strategy.purchaseAmount;
        uint _slotOffset = strategy.nextSlot + (strategy.purchasesRemaining * strategy.interval);
        uint _strategyLastSlot = _slotOffset - strategy.interval;

        // If remainder 'shortfall' below purchaseAmount on final purchase slot of existing strategy, fill
        for(uint i = 0; i < purchaseOrders[_strategyLastSlot].length; i++) {
            if(purchaseOrders[_strategyLastSlot][i].user == msg.sender) {
                if(purchaseOrders[_strategyLastSlot][i].asset == _targetAsset) {
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
                }
            }
        }

        uint _topUpPurchasesRemaining = _balance / _purchaseAmount;
        uint _remainder;
        if(_balance % _purchaseAmount > 0) {
            _remainder = _balance - (_topUpPurchasesRemaining * _purchaseAmount);
            _topUpPurchasesRemaining += 1;
        }

        uint _purchaseSlot = _slotOffset;
        for(uint i = 0; i < _topUpPurchasesRemaining; i++) {
            _purchaseSlot = _slotOffset + (strategy.interval * i);
            if(_topUpPurchasesRemaining == i && _remainder > 0) {
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, 
                                                               _remainder, 
                                                               _targetAsset));
            } else {
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, 
                                                               _purchaseAmount, 
                                                               _targetAsset));
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
     * @param _targetAsset [COMPLETE]
     * @param _amount [COMPLETE]
     */
    function withdrawTarget(address _targetAsset, uint _amount) external {
        require(targetTokens.contains(_targetAsset) == true, "Unsupported target asset type");
        require(accounts[msg.sender][_targetAsset].targetBalance >= _amount, "Withdrawal amount exceeds target asset balance");
        accounts[msg.sender][_targetAsset].targetBalance -= _amount;
        (bool success) = IERC20(_targetAsset).transfer(msg.sender, _amount);
        require(success, "Withdrawal unsuccessful");
        emit Withdrawal(msg.sender, _amount);
    }

    /**
     * @notice [TESTING] FEE
     * @param _fee fee value
     */
    function setFee(uint _fee) public onlyOwner {
        fee = _fee;
    }

    /**
     * @notice [TESTING] FEE
     * @param _balance [COMPLETE]
     */
    function incurFee(uint _balance) internal returns (uint) {
        uint _feeIncurred = _balance * fee / 100e18;
        treasury += _feeIncurred;
        return _balance - _feeIncurred;
    }

    /////////////////////////////////////////////////////
    ////////////////////// TESTING //////////////////////
    ///////// PLACEHOLDER KEEPERS & SWAP FUNCTIONS //////

    /// @notice [TESTING] placeholder oracle prices for test swapping
    uint[] public AssetPrices = [2000, 30000, 1]; // null, ETH, BTC, MATIC


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
 
            // Get array of batch purchases for current purchase slot
            uint[] memory _batchPurchaseAmounts = accumulatePurchaseOrders(purchaseSlot);
            uint[] memory _purchased = new uint[](_batchPurchaseAmounts.length);

            for(uint i = 0; i < _batchPurchaseAmounts.length; i++) {
               
                // [TESTING] If purchase amount for asset > 0, simulate "swap" using fixed asset prices
                if(_batchPurchaseAmounts[i] > 0) {
                    _purchased[i] = _batchPurchaseAmounts[i] / AssetPrices[i];
                    
                    // [TESTING LOG]
                    // address _tokenAddress = getTargetTokenAddr(i);
                    // console.log("Swapping %s DAI for %s %s", _batchPurchaseAmounts[i], _purchased[i], _tokenAddress);
                    
                    // [CALL SWAP]
                    // swap()
                }
            }

            // Handle accounting for purchased asset for each user
            for(uint i = 0; i < purchaseOrders[purchaseSlot].length; i++) {
                address _user = purchaseOrders[purchaseSlot][i].user;
                address _assetAddr = purchaseOrders[purchaseSlot][i].asset;
                uint _assetIdx = getTargetTokenIdx(_assetAddr);

                // Decrement purchases remaining
                accounts[_user][_assetAddr].purchasesRemaining -= 1;
                // Increment user's pro-rata share of the total purchase amount of the target asset
                accounts[_user][_assetAddr].targetBalance += purchaseOrders[purchaseSlot][i].amount * 
                                                            _purchased[_assetIdx] / 
                                                            _batchPurchaseAmounts[_assetIdx];
                // Update strategy's next slot
                accounts[_user][_assetAddr].nextSlot = purchaseSlot + accounts[_user][_assetAddr].interval;
                // [MAY NOT BE NECESSARY - DELETE INSTEAD?] set interval to 0 if purchasesRemaining === 0; 
                if(accounts[_user][_assetAddr].purchasesRemaining == 0) {
                    accounts[_user][_assetAddr].interval = 0;
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
}