// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Mock AAStarValidator
 * @dev Mock implementation of AAStarValidator that always returns true for BLS validation
 * This is used for testing the _parseAndValidateAAStarSignature method without relying on actual BLS cryptography
 */
contract MockAAStarValidator {
    // Storage to track validation calls for testing
    struct ValidationCall {
        bytes32[] nodeIds;
        bytes signature;
        bytes messagePoint;
        bool result;
    }

    ValidationCall[] public validationCalls;
    bool public shouldReturnTrue = true;

    // Events to match real AAStarValidator
    event SignatureValidated(bytes32 indexed messageHash, uint256 publicKeysCount, bool isValid, uint256 gasUsed);

    // Track calls to view function via a counter
    uint256 public viewCallCount;

    /**
     * @dev Mock validateAggregateSignature - always returns true unless configured otherwise
     */
    function validateAggregateSignature(
        bytes32[] calldata nodeIds,
        bytes calldata signature,
        bytes calldata messagePoint
    ) external view returns (bool) {
        // Note: Can't modify state in view function, but we can track this differently
        return shouldReturnTrue;
    }

    /**
     * @dev Helper to increment call count (called from test setup)
     */
    function incrementCallCount() external {
        viewCallCount++;
    }

    /**
     * @dev Mock verifyAggregateSignature - always returns true unless configured otherwise
     */
    function verifyAggregateSignature(
        bytes32[] calldata nodeIds,
        bytes calldata signature,
        bytes calldata messagePoint
    ) external returns (bool) {
        // Store the call for testing verification
        ValidationCall memory call = ValidationCall({
            nodeIds: nodeIds,
            signature: signature,
            messagePoint: messagePoint,
            result: shouldReturnTrue
        });
        validationCalls.push(call);

        // Emit event to match real validator behavior
        emit SignatureValidated(
            keccak256(abi.encode(nodeIds, signature, messagePoint)),
            nodeIds.length,
            shouldReturnTrue,
            1000 // Mock gas usage
        );

        return shouldReturnTrue;
    }

    /**
     * @dev Set the return value for validation (for testing different scenarios)
     */
    function setShouldReturnTrue(bool _shouldReturnTrue) external {
        shouldReturnTrue = _shouldReturnTrue;
    }

    /**
     * @dev Get number of validation calls made
     */
    function getValidationCallCount() external view returns (uint256) {
        return validationCalls.length;
    }

    /**
     * @dev Get specific validation call data
     */
    function getValidationCall(
        uint256 index
    ) external view returns (bytes32[] memory nodeIds, bytes memory signature, bytes memory messagePoint, bool result) {
        require(index < validationCalls.length, "Index out of bounds");
        ValidationCall storage call = validationCalls[index];
        return (call.nodeIds, call.signature, call.messagePoint, call.result);
    }

    /**
     * @dev Clear validation history (for test cleanup)
     */
    function clearValidationHistory() external {
        delete validationCalls;
    }
}
