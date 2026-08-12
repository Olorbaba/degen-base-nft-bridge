# Deployment and verification

## What is delivered

- `DegenNftVault`: one-way ERC-721 custody contract on Degen Chain. It stores collection, token ID, original holder, URI snapshot, timestamp, and bridge ID in an indexed on-chain deposit array.
- `BaseNftMirror`: one Base ERC-721 collection for every bridged asset. It stores the original Degen collection/token and prevents duplicate minting by bridge ID.
- Centralized relayer/web server: polls finalized Degen events, re-reads `tokenURI` at the source block, submits the Base mint, persists progress, reconciles pending transactions after restarts, and exposes `/health` and `/transfers`.
- Foundry and Node tests, deployment scripts, preflight safety checks, and public deployment evidence.

## Test deployment

| Component | Network | Address |
| --- | --- | --- |
| Source vault | Degen Chain (`666666666`) | `0x7584A721bB18E1531694a0c88D56B55CCB70D06C` |
| Destination mirror | Base Sepolia (`84532`) | `0xa0A44dEAD4F124B425DeE4466d542DD612D10517` |

Degen's former public testnet is no longer available. To prove the actual cross-chain path, a purpose-built, valueless NFT was minted on Degen Chain, locked in the vault, relayed, and minted on Base Sepolia. Public hybrid relaying is disabled after that test because a mainnet NFT must never be exchanged for a testnet NFT in normal use.

## End-to-end evidence

- Test NFT creation: `0x3fe8d7c03cd8ba45a148ef902edf6342c4f7cf590756ec73db300bf9af414c01`
- Source bridge transaction: `0x6c35817a2fc63db4a880925e06df460cf467f497f1a3350f9eee5e316dafdbd5`
- Destination mint transaction: `0x927ed03498494d7baaabb719f63e2f28864c4c38e17ec9e73b0c4a963710046b`
- Bridge ID: `0x47cf81e47f03d6da07e39baf01139dbeb0dd821fee01512eff49e46b21751751`
- Base Sepolia mirror token: `1`

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
- The relayer refuses the Degen-mainnet/Base-Sepolia hybrid configuration unless an explicit controlled-test override is enabled.

## Post-selection production launch

1. Deploy `BaseNftMirror` to Base mainnet with a multisig owner and dedicated relayer.
2. Verify both contracts on their explorers and publish the verified source addresses.
3. Configure Degen mainnet → Base mainnet, reset the source start block to the vault deployment block, and run the relayer on durable infrastructure.
4. Add monitoring, durable database storage, metadata pinning, and relayer key rotation procedures.
5. Open the bridge only after an independent contract review and a capped pilot.
