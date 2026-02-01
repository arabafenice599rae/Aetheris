#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${RPC_URL:?set RPC_URL}"
PK="${PK:?set PK (private key)}"
BIN="${1:-build/Kernel.linked.yul.bin}"

if [ ! -f "$BIN" ]; then
  echo "Missing $BIN. Run deploy/compile.sh first."
  exit 1
fi

BYTECODE="0x$(cat "$BIN" | tr -d '\n')"

ADDR=$(cast send \
  --rpc-url "$RPC_URL" \
  --private-key "$PK" \
  --create "$BYTECODE" \
  --json | jq -r '.contractAddress')

echo "Deployed Kernel at: $ADDR"