// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ControlledTestNft } from "../src/ControlledTestNft.sol";
import { DegenNftVault } from "../src/DegenNftVault.sol";

interface VmControlledTest {
    function startBroadcast() external;
    function stopBroadcast() external;
    function envAddress(string calldata) external returns (address);
}

contract ControlledBridgeTest {
    VmControlledTest internal constant vm =
        VmControlledTest(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (ControlledTestNft nft, bytes32 bridgeId) {
        address recipient = vm.envAddress("TEST_NFT_OWNER");
        DegenNftVault vault = DegenNftVault(vm.envAddress("SOURCE_VAULT_ADDRESS"));

        vm.startBroadcast();
        nft = new ControlledTestNft(recipient);
        nft.approve(address(vault), 1);
        bridgeId = vault.bridge(address(nft), 1);
        vm.stopBroadcast();
    }
}

