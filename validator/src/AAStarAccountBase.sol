// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "./AAStarValidator.sol";

/**
 * @title AAStarAccountBase
 * @dev Base contract for AAStarAccount implementations across different EntryPoint versions
 * Contains shared signature validation logic for BLS aggregate signatures
 */
abstract contract AAStarAccountBase is UUPSUpgradeable, Initializable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // Account creator (for gas payment and management)
    address public creator;

    // Signer address (for AA signature verification)
    address public signer;

    // AAStarValidator contract for BLS aggregate signature validation
    AAStarValidator public aaStarValidator;

    // Flag to enable/disable AAStarValidator
    bool public useAAStarValidator;

    // Events
    event AAStarValidatorSet(address indexed validator, bool useCustom);
    event AAStarValidationUsed(address indexed validator, bool success);

    modifier onlyCreator() {
        _onlyCreator();
        _;
    }

    function _onlyCreator() internal view {
        require(msg.sender == creator || msg.sender == address(this), "account: not Creator or self");
    }

    /**
     * @dev Initialize base account parameters
     */
    function _initializeBase(
        address _creator,
        address _signer,
        address _aaStarValidator,
        bool _useAAStarValidator
    ) internal {
        creator = _creator;
        signer = _signer;

        if (_aaStarValidator != address(0)) {
            aaStarValidator = AAStarValidator(_aaStarValidator);
            useAAStarValidator = _useAAStarValidator;
            emit AAStarValidatorSet(_aaStarValidator, _useAAStarValidator);
        }
    }

    /**
     * @dev Validate signature with BLS support
     * This function handles both standard ECDSA and BLS aggregate signature validation
     */
    function _validateSignatureBase(
        bytes memory signature,
        bytes32 userOpHash
    ) internal returns (uint256 validationData) {
        bytes32 hash = userOpHash.toEthSignedMessageHash();

        // Check if we should use AAStarValidator for BLS validation
        if (useAAStarValidator && address(aaStarValidator) != address(0)) {
            // Try to parse and validate AAStarValidator signature
            try this._parseAndValidateAAStarSignature(signature, userOpHash) returns (bool isValid) {
                emit AAStarValidationUsed(address(aaStarValidator), isValid);
                if (!isValid) {
                    return 1; // Signature failure
                }
                return 0; // Success
            } catch {
                // Fall back to standard ECDSA validation if parsing fails
                address recoveredSigner = hash.recover(signature);
                if (recoveredSigner != signer) {
                    return 1; // Signature failure
                }
                return 0;
            }
        } else {
            // Standard ECDSA validation
            address recoveredSigner = hash.recover(signature);
            if (recoveredSigner != signer) {
                return 1; // Signature failure
            }
        }

        return 0; // Success
    }

    /**
     * @dev Parse and validate AAStarValidator signature format with triple verification
     * This is a public function to allow try/catch pattern
     * Triple verification: AA signature validates userOpHash, messagePoint signature validates messagePoint, BLS validates messagePoint
     */
    function _parseAndValidateAAStarSignature(
        bytes calldata signature,
        bytes32 userOpHash
    ) external returns (bool isValid) {
        require(msg.sender == address(this), "Only self can call");

        // Parse signature components
        (
            bytes32[] memory nodeIds,
            bytes memory blsSignature,
            bytes memory messagePoint,
            bytes memory aaSignature,
            bytes memory messagePointSignature
        ) = _parseAAStarSignature(signature);

        // SECURITY 1: AA signature must validate userOpHash (ensures binding to specific userOp)
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        address recoveredSigner = ECDSA.recover(hash, aaSignature);

        // Validate that the AA signature is from the signer
        if (recoveredSigner != signer) {
            return false;
        }

        // SECURITY 2: MessagePoint signature must validate messagePoint (prevents manipulation)
        bytes32 messagePointHash = keccak256(messagePoint).toEthSignedMessageHash();
        address recoveredMessagePointSigner = ECDSA.recover(messagePointHash, messagePointSignature);

        // Validate that the messagePoint signature is from the signer
        if (recoveredMessagePointSigner != signer) {
            return false;
        }

        // SECURITY 3: Use AAStarValidator for BLS validation
        // Note: verifyAggregateSignature modifies state so this can't be view
        return aaStarValidator.verifyAggregateSignature(nodeIds, blsSignature, messagePoint);
    }

    /**
     * @dev Parse AAStarValidator signature format (new format only)
     * Format: [nodeIdsLength(32)][nodeIds...][blsSignature(256)][messagePoint(256)][aaSignature(65)][messagePointSignature(65)]
     * Total length: 674 bytes + (nodeIdsLength * 32) bytes
     */
    function _parseAAStarSignature(
        bytes calldata signature
    )
        internal
        pure
        returns (
            bytes32[] memory nodeIds,
            bytes memory blsSignature,
            bytes memory messagePoint,
            bytes memory aaSignature,
            bytes memory messagePointSignature
        )
    {
        // Parse nodeIds length and validate
        uint256 nodeIdsLength = abi.decode(signature[0:32], (uint256));
        require(nodeIdsLength > 0 && nodeIdsLength <= 100, "Invalid nodeIds length");

        // Calculate expected signature length (new format only)
        uint256 nodeIdsDataLength = nodeIdsLength * 32;
        uint256 expectedLength = 32 + nodeIdsDataLength + 256 + 256 + 65 + 65; // 674 bytes + nodeIds
        require(signature.length == expectedLength, "Invalid signature length");

        // Parse nodeIds
        nodeIds = new bytes32[](nodeIdsLength);
        for (uint256 i = 0; i < nodeIdsLength; i++) {
            nodeIds[i] = bytes32(signature[32 + i * 32:64 + i * 32]);
        }

        // Calculate base offset for other components
        uint256 baseOffset = 32 + nodeIdsDataLength;

        // Extract all components (messagePointSignature is now required)
        blsSignature = signature[baseOffset:baseOffset + 256];
        messagePoint = signature[baseOffset + 256:baseOffset + 512];
        aaSignature = signature[baseOffset + 512:baseOffset + 577];
        messagePointSignature = signature[baseOffset + 577:baseOffset + 642];
    }

    /**
     * @dev Set or update AAStarValidator configuration
     */
    function setAAStarValidator(address _aaStarValidator, bool _useAAStarValidator) external onlyCreator {
        aaStarValidator = AAStarValidator(_aaStarValidator);
        useAAStarValidator = _useAAStarValidator;
        emit AAStarValidatorSet(_aaStarValidator, _useAAStarValidator);
    }

    /**
     * @dev Execute a transaction
     */
    function execute(address dest, uint256 value, bytes calldata func) external {
        _requireFromEntryPointOrCreator();
        _call(dest, value, func);
    }

    /**
     * @dev Execute a batch of transactions
     */
    function executeBatch(address[] calldata dest, uint256[] calldata value, bytes[] calldata func) external {
        _requireFromEntryPointOrCreator();
        require(dest.length == value.length && dest.length == func.length, "array length mismatch");
        for (uint256 i = 0; i < dest.length; i++) {
            _call(dest[i], value[i], func[i]);
        }
    }

    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{ value: value }(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    /**
     * @dev Get current validation configuration
     */
    function getValidationConfig()
        external
        view
        returns (address validator, bool isAAStarEnabled, address accountCreator)
    {
        return (address(aaStarValidator), useAAStarValidator, creator);
    }

    /**
     * @dev Authorize an upgrade (for UUPS)
     */
    function _authorizeUpgrade(address newImplementation) internal view override {
        (newImplementation);
        _onlyCreator();
    }

    /**
     * @dev Check if caller is EntryPoint or Creator
     * Must be implemented by child contracts
     */
    function _requireFromEntryPointOrCreator() internal view virtual;

    /**
     * @dev Receive ETH
     */
    receive() external payable {}
}
