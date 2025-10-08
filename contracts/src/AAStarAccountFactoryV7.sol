// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./AAStarAccountV7.sol";

// Import EntryPoint v0.7 interface
import "../lib/account-abstraction/contracts/interfaces/IEntryPoint.sol";

/**
 * @title AAStarAccountFactoryV7
 * @dev Factory for creating AAStarAccountV7 smart contract wallets
 * Compatible with EntryPoint v0.7
 */
contract AAStarAccountFactoryV7 {
    AAStarAccountV7 public immutable accountImplementation;

    constructor(IEntryPoint _entryPoint) {
        accountImplementation = new AAStarAccountV7(_entryPoint);
    }

    /**
     * @dev Create an account with deterministic address
     * @param _creator The creator/owner address
     * @param _signer The signer address for AA signature verification
     * @param _aaStarValidator The AAStarValidator contract address
     * @param _useAAStarValidator Whether to use AAStarValidator for BLS validation
     * @param salt Unique salt for deterministic address generation
     * @return ret The address of the created account
     */
    function createAccount(
        address _creator,
        address _signer,
        address _aaStarValidator,
        bool _useAAStarValidator,
        uint256 salt
    ) public returns (AAStarAccountV7 ret) {
        address addr = getAddress(_creator, _signer, _aaStarValidator, _useAAStarValidator, salt);
        uint256 codeSize = addr.code.length;

        if (codeSize > 0) {
            return AAStarAccountV7(payable(addr));
        }

        ret = AAStarAccountV7(
            payable(
                new ERC1967Proxy{ salt: bytes32(salt) }(
                    address(accountImplementation),
                    abi.encodeCall(
                        AAStarAccountV7.initialize,
                        (_creator, _signer, _aaStarValidator, _useAAStarValidator)
                    )
                )
            )
        );
    }

    /**
     * @dev Calculate the counterfactual address of an account
     * @param _creator The creator/owner address
     * @param _signer The signer address for AA signature verification
     * @param _aaStarValidator The AAStarValidator contract address
     * @param _useAAStarValidator Whether to use AAStarValidator for BLS validation
     * @param salt Unique salt for deterministic address generation
     * @return The predicted account address
     */
    function getAddress(
        address _creator,
        address _signer,
        address _aaStarValidator,
        bool _useAAStarValidator,
        uint256 salt
    ) public view returns (address) {
        return
            Create2.computeAddress(
                bytes32(salt),
                keccak256(
                    abi.encodePacked(
                        type(ERC1967Proxy).creationCode,
                        abi.encode(
                            address(accountImplementation),
                            abi.encodeCall(
                                AAStarAccountV7.initialize,
                                (_creator, _signer, _aaStarValidator, _useAAStarValidator)
                            )
                        )
                    )
                )
            );
    }

    /**
     * @dev Get the account implementation address
     * @return The implementation contract address
     */
    function getImplementation() public view returns (address) {
        return address(accountImplementation);
    }
}
