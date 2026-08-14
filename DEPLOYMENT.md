# Deployment and verification

## Production contracts

| Component | Network | Address | Deployment transaction |
| --- | --- | --- | --- |
| Source vault | Degen Chain (`666666666`) | `0x22A3a63eB8276928Cb5D45f5e67533BCa7D859A6` | `0x860660d4bdd7681fcee1f1c931df861629c5f461133961d1fd4c73a6044e10c8` |
| Destination mirror | Base (`8453`) | `0xE08e1ae0e27300882CfF35534cfd5804BFa87697` | `0xd635263495bb1adb85ff4f9c59e2362e5b673c0391972c8376cedf604a047898` |

The vault was deployed in Degen block `26961814`. The mirror was deployed in Base block `49975989`. The Base mirror owner is `0xbFdD3790aBb0768FAe791cf1c551F15Aa7Bb498f` and the only authorized mint relayer is `0x96D743afDcAaFd99d2fBD70A6949f41cDd2B282D`.

## Behaviour

- `DegenNftVault` accepts one ERC-721 or one ERC-1155 unit only through `bridge(collection, tokenId)`.
- It validates ERC-721 ownership with `ownerOf` or ERC-1155 holdings with `balanceOf`, reads `tokenURI` or `uri`, then permanently locks the asset.
- It appends collection, token ID, holder, token standard, amount, exact URI, timestamp, and bridge ID to an on-chain deposit array and emits `NFTBridged`.
- `BaseNftMirror` mints every finalized deposit into one ERC-721 collection, preserves the complete URI string on-chain, records the source origin, and rejects duplicate bridge IDs.
- The vault has no release or withdrawal function. Direct transfers are rejected to prevent untracked custody.

## Verify without keys

```bash
npm install
npm run verify:deployment
```

This checks runtime bytecode on both chains, the source deposit count, and Base mirror owner/relayer values. Production relaying stays locked until the hosted Railway service, durable state volume, and controlled pilot have been verified.

## Historical testnet reference

Degen Chain no longer has a public testnet. The completed Ethereum Sepolia → Base Sepolia ERC-721 and ERC-1155 test route is retained in `deployments.json` as evidence of the original end-to-end workflow. It does not authorize production deposits.
