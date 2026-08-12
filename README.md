# Degen → Base one-way NFT bridge

A centralized, one-way ERC-721 bridge from Degen Chain to Base. The source NFT is permanently locked, and a mirror NFT carrying the same `tokenURI` is minted to the original holder on Base.

> Current release: bounty/test deployment. The controlled cross-chain test passed, but public relaying is intentionally disabled until the Base mainnet deployment after selection. Do not deposit valuable NFTs into the deployed Degen vault.

## Architecture

1. A holder approves `DegenNftVault` and calls `bridge(collection, tokenId)`.
2. The vault permanently custodies the NFT, snapshots its URI, appends its details to an on-chain array, and emits `NFTBridged`.
3. The relayer waits for source confirmations and reads the event plus `tokenURI` at the finalized source block.
4. The relayer calls `BaseNftMirror.mintFromDegen`, minting the URI to the original holder.
5. The Base contract records the Degen origin and rejects duplicate bridge IDs.

Universal ERC-721 burning is impossible because standard NFT collections do not expose a common third-party burn function. A non-withdrawable vault provides the requested irreversible, one-way behavior for arbitrary ERC-721 collections.

## Bounty deployment

| Component | Network | Address |
| --- | --- | --- |
| Source vault | Degen Chain | `0x7584A721bB18E1531694a0c88D56B55CCB70D06C` |
| Destination mirror | Base Sepolia | `0xa0A44dEAD4F124B425DeE4466d542DD612D10517` |

The controlled test bridged a newly created, valueless Degen NFT to Base Sepolia. See [BOUNTY.md](./BOUNTY.md) for transactions, evaluator instructions, security properties, and the post-selection Base mainnet plan. Machine-readable addresses are in [deployments.json](./deployments.json).

## Install and test

Requires Node.js 22+ and Foundry.

```bash
npm install
npm test
npm run build
forge test
```

Independently verify the live test deployment without a wallet or private key:

```bash
npm run verify:deployment
```

## Relayer configuration

Copy `.env.example` to `.env`. Use a dedicated deployer, a low-balance relayer key, and preferably a multisig mirror owner. Never commit `.env` or paste private keys into chat.

Important variables:

- `SOURCE_VAULT_ADDRESS`: deployed Degen vault.
- `SOURCE_START_BLOCK`: vault deployment block.
- `BASE_MIRROR_ADDRESS`: destination mirror.
- `RELAYER_PRIVATE_KEY`: destination mint-authority key.
- `SOURCE_CONFIRMATIONS` / `DESTINATION_CONFIRMATIONS`: finality delays.
- `STATE_FILE`: durable relayer checkpoint and transfer state.

Preflight and start:

```bash
npm run preflight
npm run relay
```

The service exposes:

- `GET /health`: current checkpoint and transfer state.
- `GET /transfers`: indexed transfer records.

A container deployment template with durable state is provided in `compose.example.yml`.

## User transaction

```solidity
IERC721(collection).approve(vault, tokenId);
DegenNftVault(vault).bridge(collection, tokenId);
```

The source transaction is irreversible. Direct safe transfers to the vault are rejected; users must call `bridge` so a canonical record is created.

## Current safety lock

Degen's former public testnet is unavailable. The proof deployment therefore used Degen mainnet with a purpose-built worthless NFT and Base Sepolia as the destination. `ALLOW_HYBRID_BRIDGE=false` prevents the server from running this unsafe network pairing publicly.

After bounty selection, deploy `BaseNftMirror` on Base mainnet, switch the destination configuration, complete an independent review, and begin with a capped pilot. See [SECURITY.md](./SECURITY.md).
