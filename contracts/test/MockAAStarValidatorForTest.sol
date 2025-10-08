// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MockAAStarValidatorForTest
 * @dev Mock validator for testing that always returns true for BLS verification
 * This avoids the need for actual BLS precompiled contracts
 */
contract MockAAStarValidatorForTest {
    // Storage for tracking test data
    mapping(bytes32 => bytes) public registeredKeys;
    mapping(bytes32 => bool) public isRegistered;
    bytes32[] public registeredNodes;
    address public owner;

    // Track verification attempts for testing
    uint256 public verifyCallCount;
    bytes32[] public lastNodeIds;
    bytes public lastSignature;
    bytes public lastMessagePoint;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    /**
     * @dev Mock BLS verification - always returns true for testing
     */
    function verifyAggregateSignature(
        bytes32[] calldata nodeIds,
        bytes calldata signature,
        bytes calldata messagePoint
    ) external returns (bool) {
        // Store call data for verification in tests
        verifyCallCount++;
        lastNodeIds = nodeIds;
        lastSignature = signature;
        lastMessagePoint = messagePoint;

        // Always return true for testing
        return true;
    }

    /**
     * @dev Register a public key
     */
    function registerPublicKey(bytes32 nodeId, bytes calldata publicKey) external onlyOwner {
        require(!isRegistered[nodeId], "Node already registered");

        registeredKeys[nodeId] = publicKey;
        isRegistered[nodeId] = true;
        registeredNodes.push(nodeId);
    }

    /**
     * @dev Batch register public keys
     */
    function batchRegisterPublicKeys(bytes32[] calldata nodeIds, bytes[] calldata publicKeys) external onlyOwner {
        require(nodeIds.length == publicKeys.length, "Array length mismatch");

        for (uint256 i = 0; i < nodeIds.length; i++) {
            if (!isRegistered[nodeIds[i]]) {
                registeredKeys[nodeIds[i]] = publicKeys[i];
                isRegistered[nodeIds[i]] = true;
                registeredNodes.push(nodeIds[i]);
            }
        }
    }

    /**
     * @dev Get gas estimate for verification (mock implementation)
     */
    function getGasEstimate(uint256 nodeCount) external pure returns (uint256) {
        return 150000 + (nodeCount * 10000);
    }

    /**
     * @dev Get registered node count
     */
    function getRegisteredNodeCount() external view returns (uint256) {
        return registeredNodes.length;
    }

    /**
     * @dev Reset verification tracking for testing
     */
    function resetVerificationData() external {
        verifyCallCount = 0;
        delete lastNodeIds;
        delete lastSignature;
        delete lastMessagePoint;
    }
}
