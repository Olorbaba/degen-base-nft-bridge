// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { DegenNftVault } from "../src/DegenNftVault.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeploySource {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (DegenNftVault vault) {
        vm.startBroadcast();
        vault = new DegenNftVault();
        vm.stopBroadcast();
    }
}

