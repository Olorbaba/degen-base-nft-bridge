// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {
    IERC721Metadata
} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title DegenNftVault
/// @notice One-way bridge source contract. NFTs are transferred into an
///         intentionally non-redeemable vault and a canonical record is kept.
/// @dev A third-party contract cannot call the ERC-721 burn function on every
///      collection. Custody + an irreversible vault gives the same one-way
///      semantics without assuming a non-standard burn interface.
contract DegenNftVault is IERC721Receiver, ReentrancyGuard {
    struct Deposit {
        bytes32 id;
        address collection;
        uint256 tokenId;
        address holder;
        string tokenUri;
        uint64 timestamp;
    }

    Deposit[] private _deposits;
    mapping(bytes32 => bool) public exists;
    address private _expectedCollection;
    address private _expectedHolder;
    uint256 private _expectedTokenId;

    event NFTBridged(
        bytes32 indexed id,
        address indexed collection,
        uint256 indexed tokenId,
        address holder,
        string tokenUri,
        uint256 timestamp
    );

    /// @notice Custodies an NFT and creates a bridge record.
    function bridge(address collection, uint256 tokenId)
        external
        nonReentrant
        returns (bytes32 id)
    {
        require(collection.code.length != 0, "collection is not a contract");
        address holder = IERC721(collection).ownerOf(tokenId);
        require(holder == msg.sender, "caller is not owner");

        // Snapshot the URI before custody. It is also emitted so an off-chain
        // relayer can process the record from a single event query.
        string memory uri = IERC721Metadata(collection).tokenURI(tokenId);
        id = keccak256(
            abi.encode(block.chainid, address(this), _deposits.length, collection, tokenId)
        );
        require(!exists[id], "duplicate bridge id");

        _expectedCollection = collection;
        _expectedHolder = holder;
        _expectedTokenId = tokenId;
        IERC721(collection).safeTransferFrom(msg.sender, address(this), tokenId);
        delete _expectedCollection;
        delete _expectedHolder;
        delete _expectedTokenId;
        exists[id] = true;
        _deposits.push(Deposit(id, collection, tokenId, holder, uri, uint64(block.timestamp)));

        emit NFTBridged(id, collection, tokenId, holder, uri, block.timestamp);
    }

    function depositCount() external view returns (uint256) {
        return _deposits.length;
    }

    function depositAt(uint256 index) external view returns (Deposit memory) {
        return _deposits[index];
    }

    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata)
        external
        view
        returns (bytes4)
    {
        require(operator == address(this), "transfer not initiated by vault");
        require(msg.sender == _expectedCollection, "unexpected collection");
        require(from == _expectedHolder && tokenId == _expectedTokenId, "unexpected NFT");
        return IERC721Receiver.onERC721Received.selector;
    }
}
