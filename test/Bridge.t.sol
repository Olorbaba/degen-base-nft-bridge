// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { DegenNftVault } from "../src/DegenNftVault.sol";
import { BaseNftMirror } from "../src/BaseNftMirror.sol";

contract MockNft {
    mapping(uint256 => address) public ownerOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => address) public getApproved;

    function mint(address to, uint256 id) external {
        ownerOf[id] = to;
    }

    function approve(address to, uint256 id) external {
        getApproved[id] = to;
    }

    function tokenURI(uint256) external pure returns (string memory) {
        return "ipfs://example/1.json";
    }

    function safeTransferFrom(address from, address to, uint256 id) external {
        require(
            ownerOf[id] == from
                && (msg.sender == from
                    || getApproved[id] == msg.sender
                    || isApprovedForAll[from][msg.sender]),
            "not approved"
        );
        ownerOf[id] = to;
        (bool ok,) = to.call(
            abi.encodeWithSignature(
                "onERC721Received(address,address,uint256,bytes)", msg.sender, from, id, ""
            )
        );
        require(ok, "receiver rejected");
    }
}

contract BridgeTest {
    function testVaultStoresAndCustodies() external {
        DegenNftVault vault = new DegenNftVault();
        MockNft nft = new MockNft();
        nft.mint(address(this), 7);
        nft.approve(address(vault), 7);
        bytes32 id = vault.bridge(address(nft), 7);
        require(nft.ownerOf(7) == address(vault), "NFT not custodied");
        require(vault.exists(id), "record missing");
        require(vault.depositCount() == 1, "count");
        DegenNftVault.Deposit memory deposit = vault.depositAt(0);
        require(deposit.id == id, "wrong id");
    }

    function testMirrorMintsOnceWithMetadata() external {
        BaseNftMirror mirror = new BaseNftMirror(address(this), address(this));
        bytes32 id = keccak256("source deposit");
        uint256 tokenId =
            mirror.mintFromDegen(id, address(0xBEEF), address(0xCAFE), 99, "ipfs://metadata");
        require(mirror.ownerOf(tokenId) == address(0xBEEF), "wrong recipient");
        require(
            keccak256(bytes(mirror.tokenURI(tokenId))) == keccak256(bytes("ipfs://metadata")),
            "wrong URI"
        );
        (bool ok,) = address(mirror)
            .call(
                abi.encodeWithSignature(
                    "mintFromDegen(bytes32,address,address,uint256,string)",
                    id,
                    address(this),
                    address(0),
                    1,
                    "x"
                )
            );
        require(!ok, "duplicate mint allowed");
    }

    function testVaultRejectsUnsolicitedSafeTransfer() external {
        DegenNftVault vault = new DegenNftVault();
        MockNft nft = new MockNft();
        nft.mint(address(this), 8);
        (bool ok,) = address(nft)
            .call(
                abi.encodeWithSignature(
                    "safeTransferFrom(address,address,uint256)", address(this), address(vault), 8
                )
            );
        require(!ok, "unsolicited transfer accepted");
        require(vault.depositCount() == 0, "unsolicited record created");
    }
}
