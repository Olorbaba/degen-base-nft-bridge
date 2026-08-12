export const sourceAbi = [
  { type: 'event', name: 'NFTBridged', inputs: [
    { indexed: true, name: 'id', type: 'bytes32' },
    { indexed: true, name: 'collection', type: 'address' },
    { indexed: true, name: 'tokenId', type: 'uint256' },
    { indexed: false, name: 'holder', type: 'address' },
    { indexed: false, name: 'tokenStandard', type: 'uint8' },
    { indexed: false, name: 'amount', type: 'uint256' },
    { indexed: false, name: 'tokenUri', type: 'string' },
    { indexed: false, name: 'timestamp', type: 'uint256' }
  ], anonymous: false },
  { type: 'function', name: 'depositCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'depositAt', stateMutability: 'view', inputs: [{ name: 'index', type: 'uint256' }], outputs: [{ name: 'deposit', type: 'tuple', components: [
    { name: 'id', type: 'bytes32' }, { name: 'collection', type: 'address' }, { name: 'tokenId', type: 'uint256' },
    { name: 'holder', type: 'address' }, { name: 'tokenStandard', type: 'uint8' },
    { name: 'amount', type: 'uint256' }, { name: 'tokenUri', type: 'string' }, { name: 'timestamp', type: 'uint64' }
  ] }] },
  { type: 'function', name: 'bridge', stateMutability: 'nonpayable', inputs: [{ name: 'collection', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [{ name: 'id', type: 'bytes32' }] }
];

export const mirrorAbi = [
  { type: 'event', name: 'MirrorMinted', inputs: [
    { indexed: true, name: 'bridgeId', type: 'bytes32' }, { indexed: true, name: 'mirrorTokenId', type: 'uint256' },
    { indexed: true, name: 'recipient', type: 'address' }, { indexed: false, name: 'sourceCollection', type: 'address' },
    { indexed: false, name: 'sourceTokenId', type: 'uint256' }, { indexed: false, name: 'tokenUri', type: 'string' }
  ], anonymous: false },
  { type: 'function', name: 'mintFromDegen', stateMutability: 'nonpayable', inputs: [
    { name: 'bridgeId', type: 'bytes32' }, { name: 'recipient', type: 'address' },
    { name: 'sourceCollection', type: 'address' }, { name: 'sourceTokenId', type: 'uint256' }, { name: 'tokenUri', type: 'string' }
  ], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'tokenIdForBridgeId', stateMutability: 'view', inputs: [{ name: 'bridgeId', type: 'bytes32' }], outputs: [{ type: 'uint256' }] }
];

export const erc721MetadataAbi = [
  { type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getApproved', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'isApprovedForAll', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [] }
];

export const erc1155MetadataAbi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }, { name: 'id', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'uri', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'isApprovedForAll', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }, { name: 'operator', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'setApprovalForAll', stateMutability: 'nonpayable', inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], outputs: [] }
];
