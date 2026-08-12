// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { DegenNftVault } from "../src/DegenNftVault.sol";
import { BaseNftMirror } from "../src/BaseNftMirror.sol";

contract MockNft {
    mapping(uint256 => address) public ownerOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => address) public getApproved;

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x80ac58cd;
    }

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

contract Mock1155 {
    mapping(address => mapping(uint256 => uint256)) public balanceOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => string) public uris;

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0xd9b67a26;
    }

    function mint(address to, uint256 id, uint256 amount) external { balanceOf[to][id] += amount; }
    function setApprovalForAll(address operator, bool approved) external { isApprovedForAll[msg.sender][operator] = approved; }
    function uri(uint256 id) external view returns (string memory) { return uris[id]; }

    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external {
        require(from == msg.sender || isApprovedForAll[from][msg.sender], "not approved");
        require(balanceOf[from][id] >= amount, "insufficient");
        balanceOf[from][id] -= amount;
        balanceOf[to][id] += amount;
        (bool ok, bytes memory result) = to.call(abi.encodeWithSignature(
            "onERC1155Received(address,address,uint256,uint256,bytes)", msg.sender, from, id, amount, data
        ));
        require(ok && bytes4(result) == bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)")), "receiver rejected");
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
        string memory longDataUri =
            "data:application/json;base64,eyJuYW1lIjogIk5pZ2h0IG91dCB3aXRoIGEgRGVnZW4gIzEiLCAiaW1hZ2UiOiAiYXI6Ly8xakFEbkxRUXpNZ2lKNVVIVUs2OHVNMEw0YlE2aHdmVFhOay10aU5Gc0s0P2ltZyIsICJleHRlcm5hbF91cmwiOiAiIiwgImFuaW1hdGlvbl91cmwiOiAiIiwgImF1ZGlvX3VybCI6ICIiLCAieW91dHViZV91cmwiOiAiIiwgImRlc2NyaXB0aW9uIjogIkRlZ2VucyBwYXJ0eWluZyBkdXJpbmcgRVRIIFdhcnNhdyAyMDI1In0=";
        uint256 tokenId =
            mirror.mintFromDegen(id, address(0xBEEF), address(0xCAFE), 99, longDataUri);
        require(mirror.ownerOf(tokenId) == address(0xBEEF), "wrong recipient");
        require(
            keccak256(bytes(mirror.tokenURI(tokenId))) == keccak256(bytes(longDataUri)), "wrong URI"
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

    function testVaultSupportsErc1155() external {
        DegenNftVault vault = new DegenNftVault();
        Mock1155 nft = new Mock1155();
        nft.mint(address(this), 9, 4);
        nft.setApprovalForAll(address(vault), true);
        bytes32 id = vault.bridge(address(nft), 9);
        require(nft.balanceOf(address(this), 9) == 3, "wrong source balance");
        require(nft.balanceOf(address(vault), 9) == 1, "wrong vault balance");
        DegenNftVault.Deposit memory deposit = vault.depositAt(0);
        require(deposit.id == id, "wrong id");
        require(deposit.tokenStandard == vault.TOKEN_STANDARD_ERC1155(), "wrong standard");
        require(deposit.amount == 1, "wrong amount");
    }

    function testVaultRejectsUnsolicitedErc1155Transfer() external {
        DegenNftVault vault = new DegenNftVault();
        Mock1155 nft = new Mock1155();
        nft.mint(address(this), 10, 1);
        (bool ok,) = address(nft).call(abi.encodeWithSignature(
            "safeTransferFrom(address,address,uint256,uint256,bytes)", address(this), address(vault), 10, 1, ""
        ));
        require(!ok, "unsolicited ERC1155 transfer accepted");
        require(vault.depositCount() == 0, "unsolicited record created");
    }
}
