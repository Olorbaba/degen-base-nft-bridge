# Deployment and verification

## What is delivered

- `DegenNftVault`: generic one-way ERC-721 custody contract. The evaluation instance is deployed on Ethereum Sepolia and stores collection, token ID, original holder, URI snapshot, timestamp, and bridge ID in an indexed on-chain deposit array.
- `BaseNftMirror`: one Base ERC-721 collection for every bridged asset. It stores the original Degen collection/token and prevents duplicate minting by bridge ID.
- Centralized relayer/web server: polls finalized source events, re-reads `tokenURI` at the source block, submits the Base mint, persists progress, reconciles pending transactions after restarts, and exposes `/health` and `/transfers`.
- Full bridge application: wallet/network controls, NFT metadata preview, approval/deposit workflow, transfer queue, relayer balances, community gas top-ups, and deployment proof.
- Foundry and Node tests, deployment scripts, preflight safety checks, and public deployment evidence.

## Test deployment

| Component | Network | Address |
| --- | --- | --- |
| Source vault | Ethereum Sepolia (`11155111`) | `0xC6a0208aE6FAb9c5Ddfe59700900EBcC6661A8a2` |
| Destination mirror | Base Sepolia (`84532`) | `0xa0A44dEAD4F124B425DeE4466d542DD612D10517` |

Degen's former public testnet is no longer available. The public evaluation route therefore uses Ethereum Sepolia → Base Sepolia so anyone can test the complete application without risking a real NFT. The production rollout remains Degen Chain → Base mainnet after selection.

## End-to-end evidence

- Test NFT creation: `0xe90e4e275ad67e64484ca992602b5f57738cc1072a1e4d403237e9dd99375c4e`
- Source bridge transaction: `0xce77a76c2e844dd88cd1125efacc32fb8060f10d2d1de8a7d63a3784dc152e35`
- Destination mint transaction: `0x118a89de268719820cca1a414d36382f67dc670fba19d74478c816c45c6d6c14`
- Bridge ID: `0xc46a638002a527d7cf70cd18ee46928c9b585a366ec3b5d915a98b6e9e8cd84b`
- Base Sepolia mirror token: `3`

Anyone can independently verify the runtime bytecode, ownership, relayer, bridge mapping, NFT owner, origin, and metadata without private keys:

```bash
npm install
npm run verify:deployment
```

## Security properties

- Source NFTs cannot be withdrawn from the vault.
- Unsolicited safe transfers are rejected so they cannot bypass bridge accounting.
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
