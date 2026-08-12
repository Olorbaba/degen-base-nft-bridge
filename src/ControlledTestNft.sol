// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Sacrificial NFT used only for the controlled bridge smoke test.
contract ControlledTestNft is ERC721 {
    string private constant TEST_URI =
        "data:application/json;base64,eyJuYW1lIjoiU2Vwb2xpYSBCcmlkZ2UgVGVzdCAjMSIsImRlc2NyaXB0aW9uIjoiQ29udHJvbGxlZCBvbmUtd2F5IE5GVCBicmlkZ2Ugc21va2UgdGVzdC4iLCJhdHRyaWJ1dGVzIjpbeyJ0cmFpdF90eXBlIjoiU291cmNlIiwidmFsdWUiOiJFdGhlcmV1bSBTZXBvbGlhIn0seyJ0cmFpdF90eXBlIjoiRGVzdGluYXRpb24iLCJ2YWx1ZSI6IkJhc2UgU2Vwb2xpYSJ9LHsidHJhaXRfdHlwZSI6IlRlc3QiLCJ2YWx1ZSI6IlNhY3JpZmljaWFsIn1dfQ==";

    constructor(address recipient) ERC721("Sepolia Bridge Controlled Test", "SBTEST") {
        _safeMint(recipient, 1);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return TEST_URI;
    }
}
