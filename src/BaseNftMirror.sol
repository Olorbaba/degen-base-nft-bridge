// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title BaseNftMirror
/// @notice Single destination ERC-721 collection for all bridged Degen NFTs.
///         Only the configured relayer can mint, and every source record can
///         be minted at most once.
contract BaseNftMirror is ERC721, Ownable {
    struct Origin {
        bytes32 bridgeId;
        address collection;
        uint256 tokenId;
    }

    uint256 private _nextTokenId = 1;
    address public relayer;
    mapping(bytes32 => uint256) public tokenIdForBridgeId;
    mapping(uint256 => string) private _tokenUris;
    mapping(uint256 => Origin) public originOf;

    event RelayerUpdated(address indexed previousRelayer, address indexed newRelayer);
    event MirrorMinted(
        bytes32 indexed bridgeId,
        uint256 indexed mirrorTokenId,
        address indexed recipient,
        address sourceCollection,
        uint256 sourceTokenId,
        string tokenUri
    );

    constructor(address initialOwner, address initialRelayer)
        ERC721("Degen Bridge NFT", "DBNFT")
        Ownable(initialOwner)
    {
        require(initialRelayer != address(0), "relayer is zero");
        relayer = initialRelayer;
    }

    modifier onlyRelayer() {
        require(msg.sender == relayer, "caller is not relayer");
        _;
    }

    function setRelayer(address newRelayer) external onlyOwner {
        require(newRelayer != address(0), "relayer is zero");
        emit RelayerUpdated(relayer, newRelayer);
        relayer = newRelayer;
    }

    function mintFromDegen(
        bytes32 bridgeId,
        address recipient,
        address sourceCollection,
        uint256 sourceTokenId,
        string calldata tokenUri
    ) external onlyRelayer returns (uint256 mirrorTokenId) {
        require(bridgeId != bytes32(0), "bridge id is zero");
        require(recipient != address(0), "recipient is zero");
        require(tokenIdForBridgeId[bridgeId] == 0, "already minted");

        mirrorTokenId = _nextTokenId++;
        tokenIdForBridgeId[bridgeId] = mirrorTokenId;
        originOf[mirrorTokenId] = Origin(bridgeId, sourceCollection, sourceTokenId);
        _tokenUris[mirrorTokenId] = tokenUri;
        _safeMint(recipient, mirrorTokenId);
        emit MirrorMinted(
            bridgeId, mirrorTokenId, recipient, sourceCollection, sourceTokenId, tokenUri
        );
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenUris[tokenId];
    }
}

