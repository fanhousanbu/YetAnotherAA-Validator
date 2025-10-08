// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title DeployAAStarV8
 * @dev Complete deployment script for AAStarV8 system including BLS key registration
 *
 * Usage:
 * 1. Deploy system only:
 *    forge script script/DeployAAStarV8.s.sol --rpc-url <RPC_URL> --private-key <PRIVATE_KEY> --broadcast
 *
 * 2. Deploy system and register BLS keys:
 *    REGISTER_KEYS=true forge script script/DeployAAStarV8.s.sol --rpc-url <RPC_URL> --private-key <PRIVATE_KEY> --broadcast
 *
 * 3. Deploy with existing validator:
 *    EXISTING_VALIDATOR=0x... forge script script/DeployAAStarV8.s.sol --rpc-url <RPC_URL> --private-key <PRIVATE_KEY> --broadcast
 *
 * 4. Full deployment with existing validator and key registration:
 *    EXISTING_VALIDATOR=0x... REGISTER_KEYS=true forge script script/DeployAAStarV8.s.sol --rpc-url <RPC_URL> --private-key <PRIVATE_KEY> --broadcast
 */

import "forge-std/Script.sol";
import "../src/AAStarValidator.sol";
import "../src/AAStarAccountV8.sol";
import "../src/AAStarAccountFactoryV8.sol";

contract DeployAAStarV8System is Script {
    // EntryPoint v0.8 addresses for different networks
    address constant SEPOLIA_ENTRY_POINT_V8 = 0x0576a174D229E3cFA37253523E645A78A0C91B57;
    address constant MAINNET_ENTRY_POINT_V8 = 0x0576a174D229E3cFA37253523E645A78A0C91B57;

    function run() external {
        vm.startBroadcast();

        // Determine which EntryPoint to use based on chain ID
        address entryPointAddress;
        uint256 chainId = block.chainid;

        if (chainId == 11155111) {
            // Sepolia
            entryPointAddress = SEPOLIA_ENTRY_POINT_V8;
            console.log("Using Sepolia EntryPoint v0.8");
        } else if (chainId == 1) {
            // Mainnet
            entryPointAddress = MAINNET_ENTRY_POINT_V8;
            console.log("Using Mainnet EntryPoint v0.8");
        } else {
            // Default to Sepolia for other networks
            entryPointAddress = SEPOLIA_ENTRY_POINT_V8;
            console.log("Using default EntryPoint v0.8 (Sepolia address)");
        }

        console.log("==== Deploying Complete AAStarV8 System ====");
        console.log("EntryPoint v0.8:", entryPointAddress);
        console.log("Deployer:", msg.sender);
        console.log("Chain ID:", chainId);

        // 1. Deploy or reuse existing Validator
        address existingValidator = vm.envOr("EXISTING_VALIDATOR", address(0));
        AAStarValidator validator;

        if (existingValidator != address(0)) {
            validator = AAStarValidator(existingValidator);
            console.log("Using existing Validator:", address(validator));
        } else {
            validator = new AAStarValidator();
            console.log("New Validator deployed:", address(validator));
            console.log("Validator Owner:", validator.owner());
        }

        // 2. Deploy Account Implementation
        AAStarAccountV8 accountImpl = new AAStarAccountV8(IEntryPoint(entryPointAddress));
        console.log("Account Implementation V8:", address(accountImpl));

        // 3. Deploy Factory
        AAStarAccountFactoryV8 factory = new AAStarAccountFactoryV8(IEntryPoint(entryPointAddress));
        console.log("Factory V8:", address(factory));

        // 4. Get implementation address from factory
        address factoryImpl = factory.getImplementation();
        console.log("Factory Implementation Address:", factoryImpl);

        console.log("");
        console.log("==== Deployment Summary (V8) ====");
        console.log("VALIDATOR_CONTRACT_ADDRESS=", address(validator));
        console.log("AASTAR_ACCOUNT_FACTORY_V8_ADDRESS=", address(factory));
        console.log("AASTAR_ACCOUNT_V8_IMPLEMENTATION_ADDRESS=", address(accountImpl));
        console.log("ENTRY_POINT_V8_ADDRESS=", entryPointAddress);

        console.log("");
        console.log("==== Testing System ====");

        // Test validator gas estimates
        console.log("Validator gas estimates:");
        console.log("1 node: ", validator.getGasEstimate(1));
        console.log("3 nodes:", validator.getGasEstimate(3));
        console.log("5 nodes:", validator.getGasEstimate(5));

        // Test factory functionality
        address testCreator = msg.sender;
        address testSigner = msg.sender; // Same for test
        uint256 testSalt = 12345;

        // Get predicted address
        address predictedAddr = factory.getAddress(testCreator, testSigner, address(validator), true, testSalt);
        console.log("Test predicted address:", predictedAddr);

        console.log("");
        console.log("==== Registering BLS Keys ====");

        // Optional: Register BLS keys if REGISTER_KEYS environment variable is set
        bool shouldRegisterKeys = vm.envOr("REGISTER_KEYS", false);

        if (shouldRegisterKeys) {
            _registerBLSKeys(validator);
        } else {
            console.log("Skipping BLS key registration (set REGISTER_KEYS=true to register)");
            console.log("You can register keys later using the registerBLSKeys function or manually");
        }

        console.log("");
        console.log("==== System Ready! ====");
        console.log("This is EntryPoint v0.8 deployment");
        console.log("Copy the addresses above to your .secret and launch.json files");

        vm.stopBroadcast();
    }

    /**
     * @dev Register predefined BLS public keys to the validator
     * @param validator The validator contract instance
     */
    function _registerBLSKeys(AAStarValidator validator) internal {
        console.log("Registering BLS keys to validator...");

        // Same 5 BLS keys as before
        bytes32[] memory nodeIds = new bytes32[](5);
        bytes[] memory publicKeys = new bytes[](5);

        // Node IDs
        nodeIds[0] = 0xf26f8bdca182790bad5481c1f0eac3e7ffb135ab33037dd02b8d98a1066c6e5d;
        nodeIds[1] = 0xc0e74ed91b71668dd2619e1bacaccfcc495bdbbd0a1b2a64295550c701762272;
        nodeIds[2] = 0xa3cf2ced5807ceca64db9f9ca94cecdee7ffed22803f26b7ee26a438624dd15b;
        nodeIds[3] = 0x41defc00c28336b45595c24b26e1d0a83ad4ea6832f1a276dcf42a1d43a72681;
        nodeIds[4] = 0x4dc85a434ba7af786ce05d388df756cae4d8d7236edd2c2a36991d5660ee36d7;

        // Public keys (G1 points)
        publicKeys[
            0
        ] = hex"000000000000000000000000000000000052464ad7afdeaa9416263fb0eb72925b77957796973ecb7fcda5d4fc733c4a2eb01ba15edeff51b1a0f08530f3bf4a0000000000000000000000000000000008db250fe656f5334bedca95ceb0ce9b1030928be39bce6d547146bc7335c1dee0eebce4b8129d42cb5ed2432a98e8de";
        publicKeys[
            1
        ] = hex"000000000000000000000000000000000338213c412750cf16925dd3d85ac8f5ec32bc1133ce8261959d6afcdcc3ce0155ecbddb8692eea2b49e88c2d71f0c76000000000000000000000000000000000793efb79bb1624d6d3ab6c6b6b3e1d6a098bce76d91ae01e22940c1c57d85109cb20cccf7f189dfdc1014c271c0a1fc";
        publicKeys[
            2
        ] = hex"000000000000000000000000000000000932ae492c94f0e8302b8a59871e9b62dd0d451c7dcff31ba201cf9c7ace3085fe52a3887054483d2492b4f3884476f4000000000000000000000000000000001075d2cd423b4c3534415c1b64179ee02f371def5122279131c8a6dde6e0333ef8fb31198f252ba48524b52701c35177";
        publicKeys[
            3
        ] = hex"0000000000000000000000000000000010502ac5cfcfda2477a767ce762410bc9fb90c069e9b07826b189fba3b4096b559d1fc390e23e5efa39f5191dffc64b9000000000000000000000000000000001579fc08b75f8ec4eb05d339ecb9d46ab3954b5459fd4ce454befefccc16d7b2b86758054c81eb8c32976302e9c85d65";
        publicKeys[
            4
        ] = hex"0000000000000000000000000000000009372b17ab3e93075183c40a024206cecb573f56c513759fba67800fc8c6ec3fa2cc1784e3ba0152a87500f953f1760d0000000000000000000000000000000011998d83b339db015eb501cb6cad165d7065a3035a43ec3a7d3b36e3e45b9d8a2bcb4f4b96e8af3ecd2bc84bad2f04de";

        try validator.batchRegisterPublicKeys(nodeIds, publicKeys) {
            console.log("Successfully registered 5 BLS keys");
            console.log("Registered node count:", validator.getRegisteredNodeCount());

            // Test gas estimates with registered nodes
            console.log("");
            console.log("Gas estimates after registration:");
            for (uint256 i = 1; i <= 5; i++) {
                console.log("For", i, "nodes:", validator.getGasEstimate(i));
            }
        } catch Error(string memory reason) {
            console.log("Failed to register BLS keys:", reason);
            console.log("You may need to register them manually or check validator ownership");
        } catch {
            console.log("Failed to register BLS keys (unknown error)");
            console.log("You may need to register them manually");
        }
    }
}
