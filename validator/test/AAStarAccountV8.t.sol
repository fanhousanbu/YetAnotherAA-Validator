// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/AAStarAccountV8.sol";
import "../src/AAStarAccountFactoryV8.sol";
import "./MockAAStarValidatorForTest.sol";
import "../lib/account-abstraction/contracts/core/EntryPoint.sol";
import "../lib/account-abstraction/contracts/interfaces/PackedUserOperation.sol";

contract AAStarAccountV8Test is Test {
    AAStarAccountV8 public account;
    AAStarAccountFactoryV8 public factory;
    MockAAStarValidatorForTest public validator;
    EntryPoint public entryPoint;

    address public owner;
    address public signer;
    uint256 public signerPrivateKey;
    address public beneficiary;

    function setUp() public {
        owner = address(this);
        beneficiary = makeAddr("beneficiary");

        // Generate signer with known private key
        signerPrivateKey = 0x123456;
        signer = vm.addr(signerPrivateKey);

        // Deploy EntryPoint
        entryPoint = new EntryPoint();

        // Deploy mock validator
        validator = new MockAAStarValidatorForTest();

        // Deploy factory
        factory = new AAStarAccountFactoryV8(entryPoint);

        // Create account through factory
        account = factory.createAccount(
            owner,
            signer,
            address(validator),
            true, // use AAStarValidator
            12345 // salt
        );

        // Fund the account
        vm.deal(address(account), 10 ether);
    }

    function testInitialization() public {
        assertEq(account.creator(), owner);
        assertEq(account.signer(), signer);
        assertEq(address(account.aaStarValidator()), address(validator));
        assertTrue(account.useAAStarValidator());
    }

    function testExecute() public {
        // Test direct execution
        uint256 initialBalance = beneficiary.balance;
        uint256 transferAmount = 1 ether;

        account.execute(beneficiary, transferAmount, "");

        assertEq(beneficiary.balance, initialBalance + transferAmount);
    }

    function testExecuteBatch() public {
        address beneficiary2 = makeAddr("beneficiary2");

        address[] memory targets = new address[](2);
        uint256[] memory values = new uint256[](2);
        bytes[] memory datas = new bytes[](2);

        targets[0] = beneficiary;
        targets[1] = beneficiary2;
        values[0] = 0.5 ether;
        values[1] = 0.3 ether;
        datas[0] = "";
        datas[1] = "";

        account.executeBatch(targets, values, datas);

        assertEq(beneficiary.balance, 0.5 ether);
        assertEq(beneficiary2.balance, 0.3 ether);
    }

    function testExecuteUserOp() public {
        // Test V8-specific executeUserOp function
        uint256 initialBalance = beneficiary.balance;
        uint256 transferAmount = 0.5 ether;

        vm.prank(address(entryPoint));
        account.executeUserOp(beneficiary, transferAmount, "");

        assertEq(beneficiary.balance, initialBalance + transferAmount);
    }

    function testExecuteUserOpOnlyEntryPoint() public {
        // Should revert if not called by EntryPoint
        vm.expectRevert("account: not from EntryPoint");
        account.executeUserOp(beneficiary, 0.1 ether, "");
    }

    function testValidateUserOpWithStandardSignature() public {
        // Create a user operation
        PackedUserOperation memory userOp = _createUserOp();
        bytes32 userOpHash = _getUserOpHash(userOp);

        // Sign with standard ECDSA
        bytes32 messageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, messageHash);
        userOp.signature = abi.encodePacked(r, s, v);

        // Disable BLS validation for this test
        account.setAAStarValidator(address(validator), false);

        // Validate should pass
        vm.prank(address(entryPoint));
        uint256 validationData = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(validationData, 0);
    }

    function testValidateUserOpWithBLSSignature() public {
        // Create a user operation
        PackedUserOperation memory userOp = _createUserOp();
        bytes32 userOpHash = _getUserOpHash(userOp);

        // Create BLS-style signature
        userOp.signature = _createBLSSignature(userOpHash);

        // Validate should pass (mock validator always returns true)
        vm.prank(address(entryPoint));
        uint256 validationData = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(validationData, 0);

        // Verify that the validator was called
        assertEq(validator.verifyCallCount(), 1);
    }

    function testValidateUserOpWithInvalidSignature() public {
        // Create a user operation
        PackedUserOperation memory userOp = _createUserOp();
        bytes32 userOpHash = _getUserOpHash(userOp);

        // Create invalid signature (wrong signer)
        bytes32 messageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash));
        uint256 wrongPrivateKey = 0x999999; // Different private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongPrivateKey, messageHash);
        userOp.signature = abi.encodePacked(r, s, v);

        // Disable BLS validation for this test
        account.setAAStarValidator(address(validator), false);

        // Validate should fail
        vm.prank(address(entryPoint));
        uint256 validationData = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(validationData, 1);
    }

    function testOnlyEntryPointCanValidate() public {
        PackedUserOperation memory userOp = _createUserOp();
        bytes32 userOpHash = _getUserOpHash(userOp);

        // Should revert if not called by EntryPoint
        vm.expectRevert("account: not from EntryPoint");
        account.validateUserOp(userOp, userOpHash, 0);
    }

    function testDepositAndWithdraw() public {
        // Test deposit
        uint256 depositAmount = 2 ether;
        account.addDeposit{ value: depositAmount }();
        assertEq(account.getDeposit(), depositAmount);

        // Test withdraw
        uint256 initialBalance = beneficiary.balance;
        account.withdrawDepositTo(payable(beneficiary), depositAmount);
        assertEq(beneficiary.balance, initialBalance + depositAmount);
    }

    function testSetAAStarValidator() public {
        // Deploy new validator
        MockAAStarValidatorForTest newValidator = new MockAAStarValidatorForTest();

        // Update validator
        account.setAAStarValidator(address(newValidator), false);

        assertEq(address(account.aaStarValidator()), address(newValidator));
        assertFalse(account.useAAStarValidator());
    }

    function testGetValidationConfig() public {
        (address validatorAddr, bool isEnabled, address accountCreator) = account.getValidationConfig();

        assertEq(validatorAddr, address(validator));
        assertTrue(isEnabled);
        assertEq(accountCreator, owner);
    }

    function testFactoryDeterministicAddress() public {
        // Test that the factory creates deterministic addresses
        address predictedAddress = factory.getAddress(owner, signer, address(validator), true, 99999);

        AAStarAccountV8 newAccount = factory.createAccount(owner, signer, address(validator), true, 99999);

        assertEq(address(newAccount), predictedAddress);
    }

    function testFactoryReturnsExistingAccount() public {
        // Creating the same account twice should return the same address
        AAStarAccountV8 account1 = factory.createAccount(owner, signer, address(validator), true, 88888);

        AAStarAccountV8 account2 = factory.createAccount(owner, signer, address(validator), true, 88888);

        assertEq(address(account1), address(account2));
    }

    // Helper functions

    function _createUserOp() internal view returns (PackedUserOperation memory) {
        PackedUserOperation memory userOp;
        userOp.sender = address(account);
        userOp.nonce = 0;
        userOp.initCode = "";
        userOp.callData = abi.encodeWithSelector(account.execute.selector, beneficiary, 0.1 ether, "");
        userOp.accountGasLimits = bytes32((uint256(100000) << 128) | uint256(100000));
        userOp.preVerificationGas = 21000;
        userOp.gasFees = bytes32((uint256(1 gwei) << 128) | uint256(1 gwei));
        userOp.paymasterAndData = "";
        userOp.signature = "";

        return userOp;
    }

    function _getUserOpHash(PackedUserOperation memory userOp) internal view returns (bytes32) {
        return keccak256(abi.encode(userOp, address(entryPoint), block.chainid));
    }

    function _createBLSSignature(bytes32 userOpHash) internal returns (bytes memory) {
        // Create a properly formatted BLS signature for testing
        // Format: [nodeIdsLength(32)][nodeIds...][blsSignature(256)][messagePoint(256)][aaSignature(65)][messagePointSignature(65)]

        // NodeIds
        bytes32[] memory nodeIds = new bytes32[](1);
        nodeIds[0] = bytes32(uint256(1));

        // BLS signature (mock)
        bytes memory blsSignature = new bytes(256);

        // Message point (mock)
        bytes memory messagePoint = new bytes(256);

        // AA signature (sign the userOpHash)
        bytes32 messageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, messageHash);
        bytes memory aaSignature = abi.encodePacked(r, s, v);

        // Message point signature
        bytes32 messagePointHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(messagePoint))
        );
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(signerPrivateKey, messagePointHash);
        bytes memory messagePointSignature = abi.encodePacked(r2, s2, v2);

        // Combine all parts
        return
            abi.encodePacked(
                uint256(1), // nodeIdsLength
                nodeIds[0],
                blsSignature,
                messagePoint,
                aaSignature,
                messagePointSignature
            );
    }
}
