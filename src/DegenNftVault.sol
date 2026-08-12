// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Metadata } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { IERC1155MetadataURI } from "@openzeppelin/contracts/token/ERC1155/extensions/IERC1155MetadataURI.sol";
import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title DegenNftVault
/// @notice Irreversible source custody for one ERC-721 or one ERC-1155 unit.
/// @dev The destination remains a single ERC-721 mirror collection.
contract DegenNftVault is IERC721Receiver, IERC1155Receiver, ReentrancyGuard {
    uint8 public constant TOKEN_STANDARD_ERC721 = 1;
    uint8 public constant TOKEN_STANDARD_ERC1155 = 2;
    bytes4 private constant _ERC721_INTERFACE = 0x80ac58cd;
    bytes4 private constant _ERC1155_INTERFACE = 0xd9b67a26;

    struct Deposit {
        bytes32 id;
        address collection;
        uint256 tokenId;
        address holder;
        uint8 tokenStandard;
        uint256 amount;
        string tokenUri;
        uint64 timestamp;
    }

    Deposit[] private _deposits;
    mapping(bytes32 => bool) public exists;
    address private _expectedCollection;
    address private _expectedHolder;
    uint256 private _expectedTokenId;
    uint256 private _expectedAmount;
    uint8 private _expectedStandard;

    event NFTBridged(
        bytes32 indexed id,
        address indexed collection,
        uint256 indexed tokenId,
        address holder,
        uint8 tokenStandard,
        uint256 amount,
        string tokenUri,
        uint256 timestamp
    );

    function bridge(address collection, uint256 tokenId)
        external
        nonReentrant
        returns (bytes32 id)
    {
        require(collection.code.length != 0, "collection is not a contract");
        bool is721 = _supportsInterface(collection, _ERC721_INTERFACE);
        bool is1155 = _supportsInterface(collection, _ERC1155_INTERFACE);
        require(is721 != is1155, "unsupported token standard");

        address holder = msg.sender;
        uint8 standard = is721 ? TOKEN_STANDARD_ERC721 : TOKEN_STANDARD_ERC1155;
        uint256 amount = 1;
        string memory uri;
        if (is721) {
            require(IERC721(collection).ownerOf(tokenId) == holder, "caller is not owner");
            uri = IERC721Metadata(collection).tokenURI(tokenId);
        } else {
            require(IERC1155(collection).balanceOf(holder, tokenId) >= amount, "insufficient balance");
            uri = IERC1155MetadataURI(collection).uri(tokenId);
        }

        id = keccak256(abi.encode(block.chainid, address(this), _deposits.length, collection, tokenId, standard, amount));
        require(!exists[id], "duplicate bridge id");

        _expectedCollection = collection;
        _expectedHolder = holder;
        _expectedTokenId = tokenId;
        _expectedAmount = amount;
        _expectedStandard = standard;
        if (is721) IERC721(collection).safeTransferFrom(holder, address(this), tokenId);
        else IERC1155(collection).safeTransferFrom(holder, address(this), tokenId, amount, "");
        delete _expectedCollection;
        delete _expectedHolder;
        delete _expectedTokenId;
        delete _expectedAmount;
        delete _expectedStandard;

        exists[id] = true;
        _deposits.push(Deposit(id, collection, tokenId, holder, standard, amount, uri, uint64(block.timestamp)));
        emit NFTBridged(id, collection, tokenId, holder, standard, amount, uri, block.timestamp);
    }

    function depositCount() external view returns (uint256) { return _deposits.length; }
    function depositAt(uint256 index) external view returns (Deposit memory) { return _deposits[index]; }

    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata)
        external view returns (bytes4)
    {
        require(_expectedStandard == TOKEN_STANDARD_ERC721, "unexpected standard");
        require(operator == address(this) && msg.sender == _expectedCollection, "transfer not initiated by vault");
        require(from == _expectedHolder && tokenId == _expectedTokenId, "unexpected NFT");
        return IERC721Receiver.onERC721Received.selector;
    }

    function onERC1155Received(address operator, address from, uint256 tokenId, uint256 amount, bytes calldata)
        external view returns (bytes4)
    {
        require(_expectedStandard == TOKEN_STANDARD_ERC1155, "unexpected standard");
        require(operator == address(this) && msg.sender == _expectedCollection, "transfer not initiated by vault");
        require(from == _expectedHolder && tokenId == _expectedTokenId && amount == _expectedAmount, "unexpected token");
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external pure returns (bytes4)
    {
        revert("batch transfer unsupported");
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(IERC721Receiver).interfaceId
            || interfaceId == type(IERC1155Receiver).interfaceId;
    }

    function _supportsInterface(address collection, bytes4 interfaceId) private view returns (bool) {
        try IERC165(collection).supportsInterface(interfaceId) returns (bool result) { return result; }
        catch { return false; }
    }
}
