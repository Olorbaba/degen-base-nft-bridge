# Degen → Base one-way NFT bridge

A centralized, one-way ERC-721/ERC-1155 bridge for Degen Chain → Base. The production contracts are deployed on Degen mainnet and Base mainnet, and the Railway relayer has passed a controlled end-to-end production smoke test.

> Current release: production bridge live with single-NFT and five-item batch workflows. Source custody is permanent by design.

Production application and status API: **https://degen-base-nft-bridge-production.up.railway.app**

Farcaster Mini App manifest: **https://degen-base-nft-bridge-production.up.railway.app/.well-known/farcaster.json**

Retained Ethereum Sepolia → Base Sepolia demo: **https://degen-base-nft-bridge.vercel.app**

## Architecture

1. A holder approves `DegenNftVault` and calls `bridge(collection, tokenId)`.
2. The vault permanently custodies the NFT, snapshots its URI, appends its details to an on-chain array, and emits `NFTBridged`.
3. The relayer waits for source confirmations and treats the URI captured in the finalized `NFTBridged` event as canonical. It verifies that the vault still has custody of the source asset before minting.
4. The relayer calls `BaseNftMirror.mintFromDegen`, minting the URI to the original holder.
5. The Base contract records the Degen origin and rejects duplicate bridge IDs.

Universal NFT burning is impossible because standard ERC-721 and ERC-1155 collections do not expose a common third-party burn function. A non-withdrawable vault provides the requested irreversible, one-way behavior for both standards.

## Production deployment

| Component | Network | Address |
| --- | --- | --- |
| Source vault | Degen Chain (`666666666`) | `0x22A3a63eB8276928Cb5D45f5e67533BCa7D859A6` |
| Destination mirror | Base (`8453`) | `0xE08e1ae0e27300882CfF35534cfd5804BFa87697` |

The testnet route remains documented as a reference in [deployments.json](./deployments.json). The production vault supports both ERC-721 and ERC-1155 and the Base mirror stores each original URI string on-chain.

## Install and test

Requires Node.js 22+ and Foundry.

```bash
npm install
npm test
npm run build
forge test
```

The application includes five operational views:

- **Bridge**: wallet connection, network switching, ERC-721/ERC-1155 inspection, metadata preview, approval, source deposit, and a bounded multi-NFT queue.
- **Wallet picker**: optional read-only discovery of the connected wallet's Degen NFTs through the public Degen Explorer index. Selecting an item only fills the existing form; direct RPC inspection remains authoritative before any approval or permanent lock.
- **Transfers**: waiting, submitted, completed, and failed bridge records.
- **Relayer**: live Degen and Base balances, queue depth, checkpoints, and native-token top-up forms.
- **Proof**: independently verifiable controlled deployment evidence.

The server-provided production configuration exposes the live Degen → Base route. The relayer is protected by explicit production flags and a dedicated low-balance key stored only in Railway encrypted variables.

If an injected wallet has a rate-limited Base RPC saved, use **Relayer → Repair wallet RPC** and replace it with a stable Base mainnet endpoint such as `https://mainnet.base.org`.

## Farcaster Mini App

The production app includes the Farcaster Mini App SDK, a signed-manifest-ready `/.well-known/farcaster.json` endpoint, and `fc:frame`/`fc:miniapp` feed metadata. When opened inside Farcaster, the app prefers the host-provided wallet provider; outside Farcaster it keeps using the existing injected-wallet picker. The wallet address used by a Mini App user can be completely different from the deployer, mirror owner, and relayer addresses.

The Railway domain is associated with Farcaster FID `212672` and the signed `accountAssociation` is published with the Mini App manifest. This is an off-chain Farcaster domain-ownership signature and does not change either bridge contract.

## Batch bridge workflow

The wallet NFT picker can select two to five distinct NFTs for one managed batch. Every item is revalidated directly on Degen Chain before signing and retains its own source collection, source token ID, exact URI, `NFTBridged` event, bridge ID, relayer record, and Base mirror token ID.

Wallets that explicitly advertise atomic call support can submit the approval and bridge calls as a wallet-native batch. Other wallets use a sequential safety queue. The queue stops on a rejected transaction, preserves already confirmed locks, and can resume the remaining items without submitting a confirmed NFT again. ERC-1155 approvals are de-duplicated per collection, while every selected token ID still locks exactly one unit and creates a separate Base ERC-721 mirror.

Batching is a frontend transaction workflow over the existing deployed contracts. The original `bridge(collection, tokenId)` function, single-NFT interface, relayer event processing, contract addresses, and completed transfers are unchanged.

Independently verify the live test deployment without a wallet or private key:

```bash
npm run verify:deployment
```

## Relayer configuration

Copy `.env.example` to `.env`. Use a dedicated deployer, a low-balance relayer key, and preferably a multisig mirror owner. Never commit `.env` or paste private keys into chat.

Important variables:

- `SOURCE_RPC_URL` / `SOURCE_CHAIN_ID`: Degen Chain mainnet (`666666666`).
- `SOURCE_VAULT_ADDRESS`: `0x22A3a63eB8276928Cb5D45f5e67533BCa7D859A6`.
- `SOURCE_START_BLOCK`: vault deployment block.
- `BASE_MIRROR_ADDRESS`: destination mirror.
- `BASE_RPC_URLS`: optional comma-separated destination RPC failover list used for rate limits and outages.
- `PUBLIC_SOURCE_RPC_URL` / `PUBLIC_BASE_RPC_URLS`: browser-safe RPC endpoints. Keep operator RPC URLs private when they differ.
- `RELAYER_PRIVATE_KEY`: destination mint-authority key.
- `SOURCE_CONFIRMATIONS` / `DESTINATION_CONFIRMATIONS`: finality delays.
- `MAX_TOKEN_URI_BYTES` / `MAX_MINT_GAS`: relayer bounds that reject unusually large metadata or expensive mints without stopping later queue items.
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
- `GET /api/nfts?owner=0x...`: paginated, read-only wallet NFT discovery for Degen Chain. This endpoint is a convenience index and never authorizes a bridge transaction.
- `GET /api/transfers`: indexed transfer records.
- `GET /api/transfers/:id`: one transfer by bridge ID.
- `POST /api/relay`: validates a finalized source-vault event and submits its Base mint.

A container deployment template with durable state is provided in `compose.example.yml` for the future always-on production relayer.

The frontend can be served by Vercel or by the Railway process. The relayer key must be stored only in Railway's encrypted variables; it is never part of the frontend or repository.

The Base-mainnet relayer must run as an always-on process with durable state on Railway, Fly.io, a VPS, or equivalent production infrastructure. Store its dedicated key only in that provider's encrypted secrets.

## User transaction

```solidity
IERC721(collection).approve(vault, tokenId);
DegenNftVault(vault).bridge(collection, tokenId);

IERC1155(collection).setApprovalForAll(vault, true);
DegenNftVault(vault).bridge(collection, tokenId); // locks one unit
```

The source transaction is irreversible. Direct safe transfers to the vault are rejected; users must call `bridge` so a canonical record is created.

## Testnet reference and production route

Degen's former public testnet is unavailable, so the repository retains a completed Ethereum Sepolia → Base Sepolia run as a safe reference. Production uses the deployed Degen mainnet vault and Base mirror. The relay endpoint verifies every bridge ID against a finalized event from the configured source vault before minting.

Before opening the production route, complete an independent review and a capped pilot. See [SECURITY.md](./SECURITY.md).
