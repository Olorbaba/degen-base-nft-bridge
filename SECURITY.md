# Security and operating status

## Current status

The contracts are deployed and the controlled cross-chain test passed. The relayer is intentionally offline and hybrid relaying is locked because the source is Degen mainnet and the destination is Base Sepolia.

Do not deposit an NFT into the Degen vault for normal use. Deposits are irreversible.

The frontend obtains `bridgeEnabled` from `/api/config` and rechecks it immediately before approval or bridge transactions. The current proof configuration keeps those controls disabled while leaving read-only status and relayer funding available.

## Trust model

The source lock is enforced on-chain. Destination minting is centralized: the configured relayer decides which source records are minted. On-chain replay protection prevents the same bridge record from being minted twice, but users must trust the relayer to remain available and faithfully relay eligible records.

## Production requirements

- Deploy the mirror to Base mainnet.
- Move mirror ownership to a multisig.
- Use a dedicated, replaceable relayer key with limited gas funds.
- Persist relayer state on durable storage and alert on stalled or reverted transfers.
- Pin or archive external metadata; an unchanged URI does not guarantee immutable content.
- Complete an independent smart-contract and operational security review.
