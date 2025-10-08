// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "./AAStarValidator.sol";

interface IAccount {
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData);
}

struct UserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes paymasterAndData;
    bytes signature;
}

interface IEntryPoint {
    function getNonce(address sender, uint192 key) external view returns (uint256 nonce);
    function depositTo(address account) external payable;
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title AAStarAccountV6
 * @dev ERC-4337 v0.6 account with AAStarValidator integration for BLS aggregate signature validation
 */
contract AAStarAccountV6 is IAccount, UUPSUpgradeable, Initializable {
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

    IEntryPoint private immutable _entryPoint;

    // Events
    event AccountInitialized(IEntryPoint indexed entryPoint, address indexed creator);
    event AAStarValidatorSet(address indexed validator, bool useCustom);
    event AAStarValidationUsed(address indexed validator, bool success);

    modifier onlyCreator() {
        _onlyCreator();
        _;
    }

    constructor(IEntryPoint anEntryPoint) {
        _entryPoint = anEntryPoint;
        _disableInitializers();
    }

    function _onlyCreator() internal view {
        require(msg.sender == creator || msg.sender == address(this), "account: not Creator or self");
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
        _initialize(_creator, _signer, _aaStarValidator, _useAAStarValidator);
    }

    function _initialize(
        address _creator,
        address _signer,
        address _aaStarValidator,
        bool _useAAStarValidator
    ) internal virtual {
        creator = _creator;
        signer = _signer;

        if (_aaStarValidator != address(0)) {
            aaStarValidator = AAStarValidator(_aaStarValidator);
            useAAStarValidator = _useAAStarValidator;
            emit AAStarValidatorSet(_aaStarValidator, _useAAStarValidator);
        }

        emit AccountInitialized(_entryPoint, creator);
    }

    /**
     * @dev Set AAStarValidator
     */
    function setAAStarValidator(address _aaStarValidator, bool _useAAStarValidator) external onlyCreator {
        if (_aaStarValidator != address(0)) {
            aaStarValidator = AAStarValidator(_aaStarValidator);
        }
        useAAStarValidator = _useAAStarValidator;
        emit AAStarValidatorSet(_aaStarValidator, _useAAStarValidator);
    }

    function execute(address dest, uint256 value, bytes calldata func) external {
        _requireFromEntryPointOrCreator();
        _call(dest, value, func);
    }

    function executeBatch(address[] calldata dest, bytes[] calldata func) external {
        _requireFromEntryPointOrCreator();
        require(dest.length == func.length, "wrong array lengths");
        for (uint256 i = 0; i < dest.length; i++) {
            _call(dest[i], 0, func[i]);
        }
    }

    function entryPoint() public view virtual returns (IEntryPoint) {
        return _entryPoint;
    }

    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external virtual override returns (uint256 validationData) {
        _requireFromEntryPoint();
        validationData = _validateSignature(userOp, userOpHash);
        _validateNonce(userOp.nonce);
        _payPrefund(missingAccountFunds);
    }

    /**
     * @dev Enhanced signature validation with AAStarValidator support using triple verification
     * Signature format: [nodeIds][blsSignature][messagePoint][aaSignature][messagePointSignature]
     * - nodeIds: bytes32[] array of BLS node identifiers (dynamic length)
     * - blsSignature: 256 bytes G2 BLS aggregate signature
     * - messagePoint: 256 bytes G2 point (provided by signer, verified by BLS)
     * - aaSignature: 65 bytes ECDSA signature from account owner (validates userOpHash)
     * - messagePointSignature: 65 bytes ECDSA signature from account owner (validates messagePoint)
     *
     * Security Model:
     * - AA signature validates userOpHash (ensures binding to specific UserOperation)
     * - BLS signature validates messagePoint (leverages aggregate signature security)
     * - MessagePoint signature validates messagePoint commitment (prevents manipulation)
     * - Triple verification provides enhanced security against signature manipulation attacks
     */
    function _validateSignature(
        UserOperation calldata userOp,
        bytes32 userOpHash
    ) internal returns (uint256 validationData) {
        bytes32 hash = userOpHash.toEthSignedMessageHash();

        // Use AAStarValidator if enabled and available
        if (useAAStarValidator && address(aaStarValidator) != address(0)) {
            try this._parseAndValidateAAStarSignature(userOp.signature, userOpHash) returns (bool isValid) {
                emit AAStarValidationUsed(address(aaStarValidator), isValid);
                return isValid ? 0 : 1;
            } catch {
                emit AAStarValidationUsed(address(aaStarValidator), false);
                // Fall back to default ECDSA validation if AAStarValidator fails
            }
        }

        // Default ECDSA validation using signer
        if (signer != hash.recover(userOp.signature)) {
            return 1;
        }
        return 0;
    }

    /**
     * @dev Parse and validate AAStarValidator signature format with triple verification
     * This is a public function to allow try/catch pattern
     * Triple verification: AA signature validates userOpHash, messagePoint signature validates messagePoint, BLS validates messagePoint
     */
    function _parseAndValidateAAStarSignature(
        bytes calldata signature,
        bytes32 userOpHash
    ) external view returns (bool isValid) {
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
        return aaStarValidator.validateAggregateSignature(nodeIds, blsSignature, messagePoint);
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
     * @dev Get current validation mode and validator
     */
    function getValidationConfig()
        external
        view
        returns (address validator, bool isAAStarEnabled, address accountCreator)
    {
        return (address(aaStarValidator), useAAStarValidator, creator);
    }

    function _validateNonce(uint256) internal view virtual {
        // no-op
    }

    function _payPrefund(uint256 missingAccountFunds) internal virtual {
        if (missingAccountFunds != 0) {
            (bool success, ) = payable(msg.sender).call{ value: missingAccountFunds, gas: type(uint256).max }("");
            (success);
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

    function _requireFromEntryPoint() internal view virtual {
        require(msg.sender == address(entryPoint()), "account: not from EntryPoint");
    }

    function _requireFromEntryPointOrCreator() internal view {
        require(msg.sender == address(entryPoint()) || msg.sender == creator, "account: not Creator or EntryPoint");
    }

    function _authorizeUpgrade(address newImplementation) internal view override {
        (newImplementation);
        _onlyCreator();
    }

    receive() external payable {}
}
