# Deployment and verification

## What is delivered

- `DegenNftVault`: generic one-way ERC-721/ERC-1155 custody contract. The evaluation instance is deployed on Ethereum Sepolia and stores collection, token ID, original holder, token standard, amount, URI snapshot, timestamp, and bridge ID in an indexed on-chain deposit array.
- `BaseNftMirror`: one Base ERC-721 collection for every bridged asset. It stores the original Degen collection/token and prevents duplicate minting by bridge ID.
- Centralized relayer/web server: polls finalized source events, re-reads `tokenURI` or `uri` at the source block, submits the Base mint, persists progress, reconciles pending transactions after restarts, and exposes `/health` and `/transfers`.
- Full bridge application: wallet/network controls, NFT metadata preview, approval/deposit workflow, transfer queue, relayer balances, community gas top-ups, and deployment proof.
- Foundry and Node tests, deployment scripts, preflight safety checks, and public deployment evidence.

## Test deployment

| Component | Network | Address |
| --- | --- | --- |
| Source vault | Ethereum Sepolia (`11155111`) | `0x61e9c5A6f1f656806e201857B6c08e7a3c14818a` |
| Destination mirror | Base Sepolia (`84532`) | `0xa0A44dEAD4F124B425DeE4466d542DD612D10517` |

Degen's former public testnet is no longer available. The public evaluation route therefore uses Ethereum Sepolia → Base Sepolia so anyone can test the complete application without risking a real NFT. The production rollout remains Degen Chain → Base mainnet after selection.

## End-to-end evidence

Legacy ERC-721 proof from the original ERC-721-only vault:

- Test NFT creation: `0xe90e4e275ad67e64484ca992602b5f57738cc1072a1e4d403237e9dd99375c4e`
- Source bridge transaction: `0xce77a76c2e844dd88cd1125efacc32fb8060f10d2d1de8a7d63a3784dc152e35`
- Destination mint transaction: `0x118a89de268719820cca1a414d36382f67dc670fba19d74478c816c45c6d6c14`
- Bridge ID: `0xc46a638002a527d7cf70cd18ee46928c9b585a366ec3b5d915a98b6e9e8cd84b`
- Base Sepolia mirror token: `3`

Active ERC-1155 proof from the upgraded dual-standard vault:

- ERC-1155 source collection: `0x15A9268e3c46c8cE2B11a08148bD27db07B71715`
- ERC-1155 source bridge transaction: `0x57989161079a3fa8526f5dd8da5e8e0bb3e6f82ec042ad8a32aee32ee1dc59d8`
- ERC-1155 Base Sepolia mint transaction: `0x66d3d45c8f2dbac4793d9545346736c7d8e1324f785f18e2217675077c981482`
- ERC-1155 bridge ID: `0x4f3068a25d86478ffd3fa640714861195f9c799e475a7772ea80389da1ec188b`
- ERC-1155 Base Sepolia mirror token: `5`

Anyone can independently verify the runtime bytecode, ownership, relayer, bridge mapping, NFT owner, origin, and metadata without private keys:

```bash
npm install
npm run verify:deployment
```

## Security properties

- Source ERC-721 and ERC-1155 assets cannot be withdrawn from the vault.
- Unsolicited safe ERC-721/ERC-1155 transfers and ERC-1155 batches are rejected so they cannot bypass bridge accounting.
- Only the configured relayer can mint destination NFTs.
- Every bridge ID can mint only once, even if the server retries or loses local state.
- Source and destination confirmation depths are configurable.
- The public relay trigger accepts only finalized bridge events emitted by the configured Ethereum Sepolia vault.

## Post-selection production launch

1. Deploy `BaseNftMirror` to Base mainnet with a multisig owner and dedicated relayer.
2. Verify both contracts on their explorers and publish the verified source addresses.
3. Configure Degen mainnet → Base mainnet, reset the source start block to the vault deployment block, and run the relayer on durable infrastructure.
4. Add monitoring, durable database storage, metadata pinning, and relayer key rotation procedures.
5. Open the bridge only after an independent contract review and a capped pilot.
