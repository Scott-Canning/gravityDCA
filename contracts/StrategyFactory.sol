//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import "hardhat/console.sol";

/**
 * @dev Implementation of the Gravity Strategy Factory contract. Handles 
 * strategy initiation, accounting, keeper automation, and daily batch swapping.
 */
contract StrategyFactory {
    using EnumerableMap for EnumerableMap.AddressToUintMap;
    using EnumerableMap for EnumerableMap.UintToAddressMap;

    address payable owner;
    uint public purchaseSlot;
    uint public lastTimeStamp;
    uint public immutable upKeepInterval;
    
    /**
    * @dev Mapping of each user's live strategies for each respective asset
    */
    mapping (address => mapping (address => Strategy)) public accounts;

    /**
    * @dev Mapping for each purchase slot's purchase order array
    */
    mapping (uint => PurchaseOrder[]) public purchaseOrders;
    
    /**
    * @dev Forward and reverse enumerable mappings for available source and target tokens
    * NOTE: enumerable mappings are used to allow iteration for modular swapping function,
    * length method allows proper index assignment for new assets, and memory array sizing
    */ 
    EnumerableMap.AddressToUintMap private sourceTokens;
    EnumerableMap.UintToAddressMap private reverseSourceTokens;
    EnumerableMap.AddressToUintMap private targetTokens;
    EnumerableMap.UintToAddressMap private reverseTargetTokens;

    /**
    * @dev Data type used for slotting a user's future purchase orders
    */
    struct PurchaseOrder {
        address         user;
        uint            amount;
        address         asset;
    }

    /**
    * @dev Data type used for tracking a user's current DCA strategy
    */
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

    event StrategyInitiated(uint nextPurchaseSlot, address account);
    event Deposited(uint timestamp, address from, uint sourceDeposited);

    /**
    * Set owner, Keepers checkUpKeep interval, and last time stamp
    */
    constructor(uint _upKeepInterval) {
        owner = payable(msg.sender);
        upKeepInterval = _upKeepInterval;
        lastTimeStamp = block.timestamp;
    }

    /**
    * @dev 'accounts' nested mapping getter
    */
    function getStrategyDetails(address _user, address _targetAsset) public view returns (Strategy memory) {
        return accounts[_user][_targetAsset];
    }

    /**
    * @dev 'purchaseOrders' mapping getter
    */
    function getPurchaseOrderDetails(uint _slot) public view returns (PurchaseOrder[] memory) {
        return purchaseOrders[_slot];
    }

    /**
    * @dev 'sourceTokens and reverseSourceTokens' combined setters
    */
    function setSourceToken(address _token) public onlyOwner {
        require(sourceTokens.contains(_token) == false, "Token address already present in sourceTokens");
        uint _index = sourceTokens.length() + 1;
        require(reverseSourceTokens.contains(_index) == false, "Token index already present in reverseSourceTokens");
        sourceTokens.set(_token, _index);
        reverseSourceTokens.set(_index, _token);
    }

    /**
    * @dev 'sourceTokens' enumerable mapping getter
    */
    function getSourceTokenIdx(address _token) public view returns (uint) {
        return sourceTokens.get(_token);
    }

    /**
    * @dev 'reverseSourceTokens' enumerable mapping getter
    */
    function getSourceTokenAddr(uint _index) public view returns (address) {
        return reverseSourceTokens.get(_index);
    }

    /**
    * @dev 'targetTokens and reverseTargetTokens' combined setters
    */
    function setTargetToken(address _token) public onlyOwner {
        require(targetTokens.contains(_token) == false, "Token address already present in targetTokens");
        uint _index = targetTokens.length() + 1;
        require(reverseTargetTokens.contains(_index) == false, "Token index already present in reverseTargetTokens");
        targetTokens.set(_token, _index);
        reverseTargetTokens.set(_index, _token);
    }

    /**
    * @dev 'targetTokens' enumerable mapping getter
    */
    function getTargetTokenIdx(address _token) public view returns (uint) {
        return targetTokens.get(_token);
    }

    /**
    * @dev 'reverseTargetTokens' enumerable mapping getter
    */
    function getTargetTokenAddr(uint _index) public view returns (address) {
        return reverseTargetTokens.get(_index);
    }

    /**
    * @dev Sums a purchase slot's purchase order for each asset and returns results in an array
    */
    function accumulatePurchaseOrders(uint _purchaseSlot) public view returns (uint[] memory) {
        uint _length = targetTokens.length() + 1;
        if(_length < 3) {
            _length = 3;
        }
        uint[] memory _total = new uint[](_length);
        for(uint i = 0; i < purchaseOrders[_purchaseSlot].length; i++) {
            _total[targetTokens.get(purchaseOrders[_purchaseSlot][i].asset)] += purchaseOrders[_purchaseSlot][i].amount;
        }
        return(_total);
    }

    /**
    * @dev Sums a purchase slot's purchase order for each asset and returns results in an array
    */
    function depositSource(address _token, uint256 _amount) internal {
        (bool success) = IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        require(success, "New strategy deposit unsuccessful");
        emit Deposited(block.timestamp, msg.sender, _amount);
    }

    /**
    * @dev Initiates new asset specific DCA strategy based on user's configuration
    * Note: Population of the purchaseOrders mapping uses 1 based indexing to initialize 
    * strategy at first interval.
    */
    function initiateNewStrategy(address _sourceAsset, address _targetAsset, uint _sourceBalance, uint _interval, uint _purchaseAmount) public {
        require(accounts[msg.sender][_targetAsset].purchasesRemaining == 0, "Account has existing strategy for target asset or target asset has not been fully withdrawn");
        require(sourceTokens.contains(_sourceAsset) == true, "Unsupported source asset type");
        require(targetTokens.contains(_targetAsset) == true, "Unsupported target asset type");
        require(_sourceBalance > 0, "Insufficient deposit amount");
        require(_interval == 1 || _interval == 7 || _interval == 14 || _interval == 21 || _interval == 30, "Unsupported interval");
        
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
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, _purchaseAmount, _targetAsset));
                accounts[msg.sender][_targetAsset].sourceBalance -= _purchaseAmount;
            } else { // Account for remainder purchase amounts
                purchaseOrders[_purchaseSlot].push(PurchaseOrder(msg.sender, accounts[msg.sender][_targetAsset].sourceBalance, _targetAsset));
                accounts[msg.sender][_targetAsset].sourceBalance -= accounts[msg.sender][_targetAsset].sourceBalance;
            }
        }
        depositSource(_sourceAsset, _sourceBalance);
        emit StrategyInitiated(purchaseSlot + _interval, msg.sender);
    }


    /////////// TESTING ///////////
    /// PLACEHOLDER KEEPERS & SWAP FUNCTIONS ///

    /**
    * @dev [TESTING] placeholder oracle prices for test swapping
    */
    uint[] public AssetPrices = [0, 2000, 30000, 1]; // null, ETH, BTC, MATIC

    /**
    * @dev [TESTING] checkUpkeep keeper integration placeholder function for testing purposes
    */
    function checkUpkeepTEST() external {
        uint _now = block.timestamp;
        if((_now - lastTimeStamp) > upKeepInterval) {
            performUpkeepTEST();
        }
    }

    /**
    * @dev [TESTING] performUpkeep keeper integration placeholder function for testing purposes
    */
    function performUpkeepTEST() internal {
        uint _now = block.timestamp;
        if((_now - lastTimeStamp) > upKeepInterval) {
            lastTimeStamp = _now;
 
            // Get array of batch purchases for current purchase slot
            uint[] memory _batchPurchaseAmounts = accumulatePurchaseOrders(purchaseSlot);
            uint[] memory _purchased = new uint[](_batchPurchaseAmounts.length);

            for(uint i = 1; i < _batchPurchaseAmounts.length; i++) {
               
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

    /// PLACEHOLDER KEEPERS & SWAP FUNCTIONS ///
    /////////// TESTING ///////////


    /**
    * NOTE: [TESTING] DAO contract will own contract
    */
    modifier onlyOwner () {
        require(owner == msg.sender, "Owner only: caller is not the owner");
        _;
    }

}