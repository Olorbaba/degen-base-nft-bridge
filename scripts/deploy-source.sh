#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
. ./.env
set +a
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY is required}"
: "${SOURCE_RPC_URL:=${DEGEN_RPC_URL:-}}"
: "${SOURCE_RPC_URL:?SOURCE_RPC_URL is required}"
forge script script/DeploySource.s.sol:DeploySource \
  --rpc-url "$SOURCE_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast \
  --slow \
  --non-interactive
