#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
. ./.env
set +a
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY is required}"
: "${SOURCE_RPC_URL:=${DEGEN_RPC_URL:-}}"
: "${SOURCE_RPC_URL:?SOURCE_RPC_URL is required}"
: "${SOURCE_VAULT_ADDRESS:?SOURCE_VAULT_ADDRESS is required}"
: "${TEST_NFT_OWNER:?TEST_NFT_OWNER is required}"
forge script script/ControlledBridgeTest.s.sol:ControlledBridgeTest \
  --rpc-url "$SOURCE_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast \
  --slow \
  --non-interactive
