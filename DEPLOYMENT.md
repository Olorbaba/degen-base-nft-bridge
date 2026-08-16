# Deployment and verification

## Production contracts

| Component | Network | Address | Deployment transaction |
| --- | --- | --- | --- |
| Source vault | Degen Chain (`666666666`) | `0x22A3a63eB8276928Cb5D45f5e67533BCa7D859A6` | `0x860660d4bdd7681fcee1f1c931df861629c5f461133961d1fd4c73a6044e10c8` |
| Destination mirror | Base (`8453`) | `0xE08e1ae0e27300882CfF35534cfd5804BFa87697` | `0xd635263495bb1adb85ff4f9c59e2362e5b673c0391972c8376cedf604a047898` |

The vault was deployed in Degen block `26961814`. The mirror was deployed in Base block `49975989`. The Base mirror owner is `0xbFdD3790aBb0768FAe791cf1c551F15Aa7Bb498f` and the only authorized mint relayer is `0x96D743afDcAaFd99d2fBD70A6949f41cDd2B282D`.

## Farcaster Mini App

The same Railway application is Mini App-ready at:

`https://degen-base-nft-bridge-production.up.railway.app/.well-known/farcaster.json`

It serves the official Mini App SDK bundle, a square icon, a feed card, and the required embed metadata. The host wallet is selected only when the app is opened inside Farcaster; it can be a different address from the deployer, mirror owner, or relayer and should be the address holding the source NFT.

The Railway domain is associated with Farcaster FID `212672`. Its signed `accountAssociation` is published alongside the `miniapp` object. This is an off-chain Farcaster domain-ownership signature and does not change either bridge contract.

## Behaviour

- `DegenNftVault` accepts one ERC-721 or one ERC-1155 unit only through `bridge(collection, tokenId)`.
- It validates ERC-721 ownership with `ownerOf` or ERC-1155 holdings with `balanceOf`, reads `tokenURI` or `uri`, then permanently locks the asset.
- It appends collection, token ID, holder, token standard, amount, exact URI, timestamp, and bridge ID to an on-chain deposit array and emits `NFTBridged`.
- `BaseNftMirror` mints every finalized deposit into one ERC-721 collection, preserves the complete URI string on-chain, records the source origin, and rejects duplicate bridge IDs.
- The vault has no release or withdrawal function. Direct transfers are rejected to prevent untracked custody.
- The web app and Mini App can queue two to five NFTs without changing the deployed contracts. Each selected NFT calls the existing `bridge(collection, tokenId)` function and produces an independent bridge ID and Base mirror token.
- Wallets with explicit atomic call support can bundle calls. Other wallets use a resumable sequential queue that stops after a rejected transaction and never resubmits a confirmed source lock.

## Verify without keys

```bash
npm install
npm run verify:deployment
```

This checks runtime bytecode on both chains, the source deposit count, and Base mirror owner/relayer values.

## Controlled production smoke test

Before accepting real user NFTs, one newly deployed valueless ERC-721 was used to verify the complete production path:

- Source collection: `0x4f0C8ad918225Aa84cd0732Ba0a74704F1366ED7`, token `1`
- Degen bridge transaction: `0xd687c59dbb0aed1de0803fd757a9beff5679e1df5e924f516c5ab8c347544c6f` (block `26961936`)
- Bridge ID: `0x9a4d2a0aa25e1fe19fc4cbed14368350ad4ba5be6de2fe62f082f8d59c45f07d`
- Base mint transaction: `0x0d2adfa1d32e99e92842a5539cc648bdbac3406542b185c855cb181a699d991a` (block `49980953`)
- Base mirror token: `1`

The source NFT is held by the Degen vault, the Base token is owned by the original holder, and the complete 369-character inline metadata URI is byte-for-byte identical. A duplicate mint simulation reverted with `already minted`. The Railway relayer is live with durable state and an empty queue after this completed transfer.

## Historical testnet reference

Degen Chain no longer has a public testnet. The completed Ethereum Sepolia → Base Sepolia ERC-721 and ERC-1155 test route is retained in `deployments.json` as evidence of the original end-to-end workflow. It does not authorize production deposits.
