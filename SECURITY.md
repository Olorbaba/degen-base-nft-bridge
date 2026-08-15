# Security and operating status

## Current status

The Degen mainnet vault and Base mainnet mirror are deployed. The Railway relayer is configured for the production route and remains guarded by explicit operator flags, finalized-source confirmations, source-custody checks, metadata and gas limits, and duplicate-mint protection.

Deposits are irreversible. A source NFT is permanently held by the vault and there is no withdrawal path. Users must verify the recipient wallet and destination network before signing.

The frontend rechecks the server route immediately before every approval, bridge, and relayer-funding transaction. It accepts only the audited production route or the retained Ethereum Sepolia → Base Sepolia reference route. Wallet NFT discovery is read-only and sends only the public wallet address to the configured Degen Explorer endpoint.

## Trust model

Destination minting is centralized: the configured relayer decides when an eligible, finalized source record is submitted. The Base mirror enforces one mint per bridge ID and stores the event URI exactly as recorded by the source vault. The relayer verifies ERC-721 `ownerOf` or ERC-1155 `balanceOf` custody at the source event block before minting.

The operator key and private RPC URLs belong only in Railway encrypted variables. Public API responses contain only browser-safe RPC endpoints and sanitized operational errors. Failed transfers are isolated, recorded, and retryable without skipping the source checkpoint.

## Operational requirements

- Keep the relayer key dedicated, replaceable, and funded only for expected gas.
- Move Base mirror ownership to a multisig before broad public usage.
- Persist relayer state on durable storage and alert on stalled, reverted, or repeatedly rejected transfers.
- Keep metadata size and mint gas limits appropriate for the supported collections.
- Pin or archive external metadata when application-level immutability is required; preserving a URI does not guarantee that the URI's content never changes.
- Complete an independent smart-contract and operational review before handling high-value assets.
