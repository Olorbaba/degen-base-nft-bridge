// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Sacrificial NFT used only for the controlled bridge smoke test.
contract ControlledTestNft is ERC721 {
    string private constant TEST_URI =
        "data:application/json;base64,eyJuYW1lIjoiRGVnZW4gQnJpZGdlIFRlc3QgIzEiLCJkZXNjcmlwdGlvbiI6IkNvbnRyb2xsZWQgb25lLXdheSBicmlkZ2Ugc21va2UgdGVzdC4iLCJhdHRyaWJ1dGVzIjpbeyJ0cmFpdF90eXBlIjoiU291cmNlIiwidmFsdWUiOiJEZWdlbiBDaGFpbiJ9LHsidHJhaXRfdHlwZSI6IlRlc3QiLCJ2YWx1ZSI6IlNhY3JpZmljaWFsIn1dfQ==";

    constructor(address recipient) ERC721("Degen Bridge Controlled Test", "DBTEST") {
        _safeMint(recipient, 1);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return TEST_URI;
    }
}

