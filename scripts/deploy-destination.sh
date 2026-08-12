#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
. ./.env
set +a
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY is required}"
: "${BASE_RPC_URL:?BASE_RPC_URL is required}"
: "${RELAYER_ADDRESS:?RELAYER_ADDRESS is required}"
: "${MIRROR_OWNER:?MIRROR_OWNER is required}"
forge script script/DeployDestination.s.sol:DeployDestination \
  --rpc-url "$BASE_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast \
  --slow \
  --non-interactive
