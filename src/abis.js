export const sourceAbi = [
  { type: 'event', name: 'NFTBridged', inputs: [
    { indexed: true, name: 'id', type: 'bytes32' },
    { indexed: true, name: 'collection', type: 'address' },
    { indexed: true, name: 'tokenId', type: 'uint256' },
    { indexed: false, name: 'holder', type: 'address' },
    { indexed: false, name: 'tokenUri', type: 'string' },
    { indexed: false, name: 'timestamp', type: 'uint256' }
  ], anonymous: false },
  { type: 'function', name: 'depositCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'depositAt', stateMutability: 'view', inputs: [{ name: 'index', type: 'uint256' }], outputs: [{ name: 'deposit', type: 'tuple', components: [
    { name: 'id', type: 'bytes32' }, { name: 'collection', type: 'address' }, { name: 'tokenId', type: 'uint256' },
    { name: 'holder', type: 'address' }, { name: 'tokenUri', type: 'string' }, { name: 'timestamp', type: 'uint64' }
  ] }] }
];

export const mirrorAbi = [
  { type: 'function', name: 'mintFromDegen', stateMutability: 'nonpayable', inputs: [
    { name: 'bridgeId', type: 'bytes32' }, { name: 'recipient', type: 'address' },
    { name: 'sourceCollection', type: 'address' }, { name: 'sourceTokenId', type: 'uint256' }, { name: 'tokenUri', type: 'string' }
  ], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'tokenIdForBridgeId', stateMutability: 'view', inputs: [{ name: 'bridgeId', type: 'bytes32' }], outputs: [{ type: 'uint256' }] }
];

export const erc721MetadataAbi = [
  { type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'string' }] }
];

