// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

/// @notice Sacrificial ERC-1155 used only for the controlled bridge test.
contract ControlledTest1155 is ERC1155 {
    string private constant TEST_URI =
        "data:application/json;base64,eyJuYW1lIjoiU2Vwb2xpYSBFUkMtMTE1NSBCcmlkZ2UgVGVzdCAjMSIsImRlc2NyaXB0aW9uIjoiQ29udHJvbGxlZCBFUkMtMTE1NSBicmlkZ2UgdGVzdC4iLCJhdHRyaWJ1dGVzIjpbeyJ0cmFpdF90eXBlIjoiU291cmNlIiwidmFsdWUiOiJFdGhlcmV1bSBTZXBvbGlhIn0seyJ0cmFpdF90eXBlIjoiU3RhbmRhcmQiLCJ2YWx1ZSI6IkVSQy0xMTU1In0seyJ0cmFpdF90eXBlIjoiRGVzdGluYXRpb24iLCJ2YWx1ZSI6IkJhc2UgU2Vwb2xpYSJ9XX0=";

    constructor(address recipient) ERC1155(TEST_URI) { _mint(recipient, 1, 2, ""); }
}
