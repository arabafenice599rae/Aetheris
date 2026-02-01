#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-1153}"          # 1153 | legacy
PM_HEX="${2:?pm address required, e.g. 0x00b0...62ac}"

# basic sanity on PM address
if [[ ! "$PM_HEX" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: PM_HEX must be a 20-byte hex address like 0x + 40 hex chars"
  exit 1
fi

mkdir -p build

# select kernel
if [ "$PROFILE" = "1153" ]; then
  KIN="contracts/Kernel1153.yul"
elif [ "$PROFILE" = "legacy" ]; then
  KIN="contracts/KernelLegacy.yul"
else
  echo "ERROR: PROFILE must be '1153' or 'legacy'"
  exit 1
fi

# copy + link
cp "$KIN" build/Kernel.yul

node <<'NODE'
const fs = require("fs");
const pm = process.env.PM_HEX;
let s = fs.readFileSync("build/Kernel.yul","utf8");

// replace all occurrences of __PM__ with the actual address literal
// expected placeholder: let PM := __PM__
s = s.replaceAll("__PM__", pm);

fs.writeFileSync("build/Kernel.linked.yul", s);
NODE

# compile strict-assembly
solc --strict-assembly build/Kernel.linked.yul -o build --bin

# report
BIN_FILE=$(ls -1 build/*.bin 2>/dev/null | head -n 1 || true)
if [ -z "$BIN_FILE" ]; then
  echo "ERROR: solc did not produce a .bin output in build/"
  exit 1
fi

BYTES=$(( $(wc -c < "$BIN_FILE") / 2 ))
echo "OK: compiled -> $BIN_FILE"
echo "Bytecode size (bytes): $BYTES"
echo "Tip: deploy the hex in $BIN_FILE with cast/hardhat/foundry."