// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { BaseNftMirror } from "../src/BaseNftMirror.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
    function envAddress(string calldata) external returns (address);
}

contract DeployDestination {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (BaseNftMirror mirror) {
        address relayer = vm.envAddress("RELAYER_ADDRESS");
        address owner = vm.envAddress("MIRROR_OWNER");
        vm.startBroadcast();
        mirror = new BaseNftMirror(owner, relayer);
        vm.stopBroadcast();
    }
}

