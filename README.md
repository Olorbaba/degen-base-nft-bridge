# Degen → Base one-way NFT bridge

A centralized, one-way ERC-721 bridge designed for Degen Chain → Base. The public evaluation release uses Ethereum Sepolia → Base Sepolia so judges can safely test the complete workflow with valueless NFTs.

> Current release: public two-testnet deployment. Use test NFTs only; the source lock remains permanent by design.

Live application and read-only status API: **https://degen-base-nft-bridge.vercel.app**

## Architecture

1. A holder approves `DegenNftVault` and calls `bridge(collection, tokenId)`.
2. The vault permanently custodies the NFT, snapshots its URI, appends its details to an on-chain array, and emits `NFTBridged`.
3. The relayer waits for source confirmations and reads the event plus `tokenURI` at the finalized source block.
4. The relayer calls `BaseNftMirror.mintFromDegen`, minting the URI to the original holder.
5. The Base contract records the Degen origin and rejects duplicate bridge IDs.

Universal ERC-721 burning is impossible because standard NFT collections do not expose a common third-party burn function. A non-withdrawable vault provides the requested irreversible, one-way behavior for arbitrary ERC-721 collections.

## Test deployment

| Component | Network | Address |
| --- | --- | --- |
| Source vault | Ethereum Sepolia | `0xC6a0208aE6FAb9c5Ddfe59700900EBcC6661A8a2` |
| Destination mirror | Base Sepolia | `0xa0A44dEAD4F124B425DeE4466d542DD612D10517` |

The controlled test bridged a newly created, valueless Ethereum Sepolia NFT to Base Sepolia. See [DEPLOYMENT.md](./DEPLOYMENT.md) for transactions, independent verification instructions, security properties, and the Base mainnet rollout plan. Machine-readable addresses are in [deployments.json](./deployments.json).

## Install and test

Requires Node.js 22+ and Foundry.

```bash
npm install
npm test
npm run build
forge test
```

The application includes four operational views:

- **Bridge**: wallet connection, network switching, ERC-721 inspection, metadata preview, approval, and source deposit.
- **Transfers**: waiting, submitted, completed, and failed bridge records.
- **Relayer**: live source and Base Sepolia ETH balances, queue depth, checkpoints, and native-token top-up forms.
- **Proof**: independently verifiable controlled deployment evidence.

The current server-provided configuration enables the public Ethereum Sepolia → Base Sepolia test route. The former Degen-mainnet → Base-Sepolia hybrid route remains retired.

Independently verify the live test deployment without a wallet or private key:

```bash
npm run verify:deployment
```

## Relayer configuration

Copy `.env.example` to `.env`. Use a dedicated deployer, a low-balance relayer key, and preferably a multisig mirror owner. Never commit `.env` or paste private keys into chat.

Important variables:

- `SOURCE_RPC_URL` / `SOURCE_CHAIN_ID`: current source network (Ethereum Sepolia for evaluation; Degen Chain for production).
- `SOURCE_VAULT_ADDRESS`: deployed source vault.
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

- `GET /healthz`: process health independent of RPC availability.
- `GET /api/config`: public chain, contract, relayer, and safety configuration.
- `GET /api/status`: balances, queue metrics, blocks, checkpoints, and runtime state.
- `GET /api/transfers`: indexed transfer records.
- `GET /api/transfers/:id`: one transfer by bridge ID.
- `POST /api/relay`: validates a finalized source-vault event and submits its Base Sepolia mint.

A container deployment template with durable state is provided in `compose.example.yml` for the future always-on production relayer.

The test application, live status API, and validated testnet relay trigger are Vercel-compatible. Import this repository into Vercel with the repository root as the project root; `vercel.json` serves the frontend from `docs/` and the serverless endpoints from `api/`. The low-balance testnet relayer key must be stored only in a Vercel Sensitive environment variable.

The Base-mainnet relayer must run as an always-on process with durable state on Railway, Fly.io, a VPS, or equivalent production infrastructure. Store its dedicated key only in that provider's encrypted secrets.

## User transaction

```solidity
IERC721(collection).approve(vault, tokenId);
DegenNftVault(vault).bridge(collection, tokenId);
```

The source transaction is irreversible. Direct safe transfers to the vault are rejected; users must call `bridge` so a canonical record is created.

## Current public test route

Degen's former public testnet is unavailable. To avoid locking real Degen NFTs during evaluation, the public application now uses Ethereum Sepolia as the source and Base Sepolia as the destination. The relay endpoint verifies every bridge ID against a finalized event from the configured source vault before minting.

For production, deploy `BaseNftMirror` on Base mainnet, switch the destination configuration, complete an independent review, and begin with a capped pilot. See [SECURITY.md](./SECURITY.md).
