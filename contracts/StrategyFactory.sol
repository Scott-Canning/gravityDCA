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
    
    /// @notice Mapping of each user's live strategies for each respective asset 
    mapping (address => mapping (address => Strategy)) public accounts;

    
    /// @notice Mapping for each purchase slot's purchase order array
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
        address         sourceAsset;
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

    /// @notice Set owner, Keepers checkUpKeep interval, and last time stamp
    constructor(uint _upKeepInterval) {
        upKeepInterval = _upKeepInterval;
        lastTimeStamp = block.timestamp;
    }

    /// @notice 'accounts' nested mapping getter
    /// @return [COMPLETE]
    function getStrategyDetails(address _user, address _targetAsset) public view returns (Strategy memory) {
        return accounts[_user][_targetAsset];
    }

    /// @notice 'purchaseOrders' mapping getter
    /// @return [COMPLETE]
    function getPurchaseOrderDetails(uint _slot) public view returns (PurchaseOrder[] memory) {
        return purchaseOrders[_slot];
    }


    /// @notice 'sourceTokens and reverseSourceTokens' combined setters
    function setSourceToken(address _token) public onlyOwner {
        require(sourceTokens.contains(_token) == false, "Token address already present in sourceTokens");
        uint _index = sourceTokens.length();
        require(reverseSourceTokens.contains(_index) == false, "Token index already present in reverseSourceTokens");
        sourceTokens.set(_token, _index);
        reverseSourceTokens.set(_index, _token);
    }

    /// @notice 'sourceTokens' enumerable mapping getter
    /// @return [COMPLETE]
    function getSourceTokenIdx(address _token) public view returns (uint) {
        return sourceTokens.get(_token);
    }

    /// @notice 'reverseSourceTokens' enumerable mapping getter
    /// @return [COMPLETE]
    function getSourceTokenAddr(uint _index) public view returns (address) {
        return reverseSourceTokens.get(_index);
    }

    /// @notice 'targetTokens and reverseTargetTokens' combined setters
    function setTargetToken(address _token) public onlyOwner {
        require(targetTokens.contains(_token) == false, "Token address already present in targetTokens");
        uint _index = targetTokens.length();
        require(reverseTargetTokens.contains(_index) == false, "Token index already present in reverseTargetTokens");
        targetTokens.set(_token, _index);
        reverseTargetTokens.set(_index, _token);
    }


    /// @notice 'targetTokens' enumerable mapping getter
    /// @return [COMPLETE]
    function getTargetTokenIdx(address _token) public view returns (uint) {
        return targetTokens.get(_token);
    }

    /// @notice 'reverseTargetTokens' enumerable mapping getter
    /// @return [COMPLETE]
    function getTargetTokenAddr(uint _index) public view returns (address) {
        return reverseTargetTokens.get(_index);
    }

    /// @notice Sums a purchase slot's purchase order for each asset and returns results in an array
    /// @return [COMPLETE]
    function accumulatePurchaseOrders(uint _purchaseSlot) public view returns (uint[] memory) {
        uint[] memory _total = new uint[](targetTokens.length());
        for(uint i = 0; i < purchaseOrders[_purchaseSlot].length; i++) {
            _total[targetTokens.get(purchaseOrders[_purchaseSlot][i].asset)] += purchaseOrders[_purchaseSlot][i].amount;
        }
        return(_total);
    }

    /**
    * @notice Initiates new DCA strategy based on user's configuration
    * note: Population of the purchaseOrders mapping uses 1-based indexing to initialize 
    * strategy at first interval.
    */
    function initiateNewStrategy(address _sourceAsset, address _targetAsset, uint _sourceBalance, uint _interval, uint _purchaseAmount) public payable {
        require(accounts[msg.sender][_targetAsset].purchasesRemaining == 0, "Account has existing strategy for target asset");
        require(sourceTokens.contains(_sourceAsset) == true, "Unsupported source asset type");
        require(targetTokens.contains(_targetAsset) == true, "Unsupported target asset type");
        require(_sourceBalance > 0, "Insufficient deposit amount");
        require(_interval == 1 || _interval == 7 || _interval == 14 || _interval == 21 || _interval == 30, "Unsupported interval");
        depositSource(_sourceAsset, _sourceBalance);

        // Calculate purchases remaining and account for remainder purchase amounts
        uint _purchasesRemaining = _sourceBalance / _purchaseAmount;
        if((_sourceBalance % _purchaseAmount) > 0) {
            _purchasesRemaining += 1;
        }

        // Target balance carries over if existing user initiates new strategy
        uint _targetBalance = 0;
        if(accounts[msg.sender][_targetAsset].targetBalance > 0){
            _targetBalance += accounts[msg.sender][_targetAsset].targetBalance;
        }

        accounts[msg.sender][_targetAsset] = Strategy(purchaseSlot + _interval,
                                                      _sourceAsset,
                                                      _targetAsset,
                                                      _sourceBalance,
                                                      0,
                                                      _interval,
                                                      _purchaseAmount,
                                                      _purchasesRemaining
                                                      );

        // Populate purchaseOrders mapping
        for(uint i = 1; i <= _purchasesRemaining; i++) {
            uint _purchaseSlot = purchaseSlot + (_interval * i);
            if(accounts[msg.sender][_targetAsset].sourceBalance >= accounts[msg.sender][_targetAsset].purchaseAmount) {
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, 
                                                                 _purchaseAmount, 
                                                                 _targetAsset));
                accounts[msg.sender][_targetAsset].sourceBalance -= _purchaseAmount;
            } else { // Account for remainder purchase amounts
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, 
                                                                 accounts[msg.sender][_targetAsset].sourceBalance, 
                                                                 _targetAsset));
                accounts[msg.sender][_targetAsset].sourceBalance = 0;
            }
        }
        emit StrategyInitiated(msg.sender, purchaseSlot + _interval);
    }

    /**
    * @notice Allows users to top up an existing strategy with additional units of the source asset
    * note:
    * - Population of the purchaseOrders mapping uses 0-based indexing to top up an existing
    *   strategy starting at the _slotOffset
    * - Function first checks for a purchaseAmount shortfall in the last purchase slot of the 
    *   user's existing strategy and if one exists, it fills that purchase slot and updates the 
    *   _topUpAmount accordingly
    */
    function topUpStrategy(address _sourceAsset, address _targetAsset, uint _topUpAmount) public payable {
        require(accounts[msg.sender][_targetAsset].purchasesRemaining > 0, "Account does not have existing strategy for target asset");
        require(sourceTokens.contains(_sourceAsset) == true, "Unsupported source asset type");
        require(targetTokens.contains(_targetAsset) == true, "Unsupported target asset type");
        require(_topUpAmount > 0, "Insufficient deposit amount");
        depositSource(_sourceAsset, _topUpAmount);
        accounts[msg.sender][_targetAsset].sourceBalance += _topUpAmount;

        // Calculate offset starting point for top up purchases and ending point for existing purchase shortfalls
        uint _purchaseAmount = accounts[msg.sender][_targetAsset].purchaseAmount;
        uint _nextSlot = accounts[msg.sender][_targetAsset].nextSlot;
        uint _purchasesRemaining = accounts[msg.sender][_targetAsset].purchasesRemaining;
        uint _interval = accounts[msg.sender][_targetAsset].interval;
        uint _slotOffset = _nextSlot + (_purchasesRemaining * _interval);
        uint _strategyLastSlot = _slotOffset - _interval;

        // If remainder 'shortfall' below purchaseAmount on final purchase slot of existing strategy, fill
        for(uint i = 0; i < purchaseOrders[_strategyLastSlot].length; i++) {
            if(purchaseOrders[_strategyLastSlot][i].user == msg.sender) {
                if(purchaseOrders[_strategyLastSlot][i].asset == _targetAsset) {
                    uint _amountLastSlot = purchaseOrders[_strategyLastSlot][i].amount;
                    if(_amountLastSlot < _purchaseAmount) {
                        if(_topUpAmount > (_purchaseAmount - _amountLastSlot)) {
                            _topUpAmount -= (_purchaseAmount - _amountLastSlot);
                            purchaseOrders[_strategyLastSlot][i].amount = _purchaseAmount;
                        } else if (_topUpAmount < (_purchaseAmount - _amountLastSlot)) {
                            purchaseOrders[_strategyLastSlot][i].amount += _topUpAmount;
                            _topUpAmount = 0;
                        } else {
                            purchaseOrders[_strategyLastSlot][i].amount = _purchaseAmount;
                            _topUpAmount = 0;
                        }
                    }
                }
            }
        }

        uint _topUpPurchasesRemaining = _topUpAmount / _purchaseAmount;
        if(_topUpAmount % _purchaseAmount > 0) {
            _topUpPurchasesRemaining += 1;
        }

        for(uint i = 0; i < _topUpPurchasesRemaining; i++) {
            uint _purchaseSlot = _slotOffset + (_interval * i);
            if(accounts[msg.sender][_targetAsset].sourceBalance >= accounts[msg.sender][_targetAsset].purchaseAmount) {
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, 
                                                                 _purchaseAmount, 
                                                                 _targetAsset));
                accounts[msg.sender][_targetAsset].sourceBalance -= _purchaseAmount;
            } else { // Account for remainder purchase amounts
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, 
                                                                 accounts[msg.sender][_targetAsset].sourceBalance, 
                                                                 _targetAsset));
                accounts[msg.sender][_targetAsset].sourceBalance = 0;
            }
        }
        accounts[msg.sender][_targetAsset].purchasesRemaining += _topUpPurchasesRemaining;
        emit StrategyToppedUp(msg.sender, _slotOffset);
    }


    /// @notice Sums a purchase slot's purchase order for each asset and returns results in an array
    function depositSource(address _token, uint256 _amount) internal {
        (bool success) = IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        require(success, "Deposit unsuccessful");
        emit Deposited(block.timestamp, msg.sender, _amount);
    }

    /// @notice Allows users to withdrawal target asset
    function withdrawTarget(address _targetAsset, uint _amount) external {
        require(targetTokens.contains(_targetAsset) == true, "Unsupported target asset type");
        require(accounts[msg.sender][_targetAsset].targetBalance >= _amount, "Withdrawal amount exceeds target asset balance");
        accounts[msg.sender][_targetAsset].targetBalance -= _amount;
        (bool success) = IERC20(_targetAsset).transfer(msg.sender, _amount);
        require(success, "Withdrawal unsuccessful");
        emit Withdrawal(msg.sender, _amount);
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