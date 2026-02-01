#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-1153}"           # 1153 | legacy
PM_HEX="${2:?pm address like 0x...}"
MODE="${3:-all}"               # all | minimal
OUTDIR="${4:-build}"

if [[ ! "$PM_HEX" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "PM must be 0x + 40 hex chars"
  exit 1
fi

mkdir -p "$OUTDIR"

if [ "$PROFILE" = "1153" ]; then
  cp contracts/Kernel1153.yul "$OUTDIR/Kernel.yul"
else
  cp contracts/KernelLegacy.yul "$OUTDIR/Kernel.yul"
fi

node -e "
const fs=require('fs');
let s=fs.readFileSync('$OUTDIR/Kernel.yul','utf8');
s=s.replaceAll('__PM__', '$PM_HEX');

if('$MODE'==='minimal'){
  s=s.replace(/\\/\\*IF_CALLV\\*\\/[\\s\\S]*?\\/\\*ENDIF_CALLV\\*\\//g,'');
  s=s.replace(/\\/\\*IF_ERC20XFER\\*\\/[\\s\\S]*?\\/\\*ENDIF_ERC20XFER\\*\\//g,'');
}

fs.writeFileSync('$OUTDIR/Kernel.linked.yul', s);
"

solc --strict-assembly "$OUTDIR/Kernel.linked.yul" -o "$OUTDIR" --bin >/dev/null

BIN="$(ls -1 $OUTDIR/*.bin | head -n 1)"

BYTE_LEN=$(python3 - <<PY
import pathlib
p=pathlib.Path("$BIN")
h=p.read_text().strip()
print(len(h)//2)
PY
)

HASH=$(python3 - <<PY
import hashlib, pathlib
p=pathlib.Path("$BIN")
b=bytes.fromhex(p.read_text().strip())
print(hashlib.sha256(b).hexdigest())
PY
)

echo "OK"
echo " profile : $PROFILE"
echo " mode    : $MODE"
echo " pm      : $PM_HEX"
echo " bin     : $BIN"
echo " bytes   : $BYTE_LEN"
echo " sha256  : $HASH"