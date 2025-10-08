// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "./AAStarAccountBase.sol";

// Import EntryPoint v0.7 interfaces
import "../lib/account-abstraction/contracts/interfaces/IAccount.sol";
import "../lib/account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "../lib/account-abstraction/contracts/interfaces/PackedUserOperation.sol";

/**
 * @title AAStarAccountV7
 * @dev ERC-4337 v0.7 account with AAStarValidator integration for BLS aggregate signature validation
 *
 * This version supports EntryPoint v0.7 which introduces:
 * - PackedUserOperation structure
 * - Different validation logic
 * - Updated nonce handling
 */
contract AAStarAccountV7 is IAccount, AAStarAccountBase {
    IEntryPoint private immutable _entryPoint;

    // Events
    event AccountInitialized(IEntryPoint indexed entryPoint, address indexed creator);

    constructor(IEntryPoint anEntryPoint) {
        _entryPoint = anEntryPoint;
        _disableInitializers();
    }

    /**
     * @dev Initialize account with creator and signer addresses
     */
    function initialize(
        address _creator,
        address _signer,
        address _aaStarValidator,
        bool _useAAStarValidator
    ) public virtual initializer {
        _initializeBase(_creator, _signer, _aaStarValidator, _useAAStarValidator);
        emit AccountInitialized(_entryPoint, _creator);
    }

    /**
     * @dev Validate user operation for EntryPoint v0.7
     * Handles PackedUserOperation format
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external virtual override returns (uint256 validationData) {
        _requireFromEntryPoint();

        validationData = _validateSignatureBase(userOp.signature, userOpHash);

        if (missingAccountFunds > 0) {
            _payPrefund(missingAccountFunds);
        }
    }

    /**
     * @dev Pay prefund to EntryPoint
     */
    function _payPrefund(uint256 missingAccountFunds) internal {
        if (missingAccountFunds > 0) {
            (bool success, ) = payable(msg.sender).call{ value: missingAccountFunds, gas: type(uint256).max }("");
            require(success, "prefund payment failed");
        }
    }

    /**
     * @dev Return the entryPoint
     */
    function entryPoint() public view virtual returns (IEntryPoint) {
        return _entryPoint;
    }

    /**
     * @dev Deposit funds to EntryPoint
     */
    function addDeposit() public payable {
        entryPoint().depositTo{ value: msg.value }(address(this));
    }

    /**
     * @dev Get current deposit in EntryPoint
     */
    function getDeposit() public view returns (uint256) {
        return entryPoint().balanceOf(address(this));
    }

    /**
     * @dev Withdraw funds from EntryPoint
     */
    function withdrawDepositTo(address payable withdrawAddress, uint256 amount) public onlyCreator {
        entryPoint().withdrawTo(withdrawAddress, amount);
    }

    /**
     * @dev Check if caller is EntryPoint
     */
    function _requireFromEntryPoint() internal view virtual {
        require(msg.sender == address(entryPoint()), "account: not from EntryPoint");
    }

    /**
     * @dev Check if caller is EntryPoint or Creator
     */
    function _requireFromEntryPointOrCreator() internal view override {
        require(msg.sender == address(entryPoint()) || msg.sender == creator, "account: not Creator or EntryPoint");
    }
}
