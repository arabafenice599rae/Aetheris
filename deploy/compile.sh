#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-1153}"             # 1153 | legacy
PM_HEX="${2:?pm address required like 0x...}"
FLAGS="${3:-all}"                # all | minimal (strip ops)
OUTDIR="${4:-build}"

if [[ ! "$PM_HEX" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "PM must be 0x + 40 hex chars"
  exit 1
fi

mkdir -p "$OUTDIR"

# pick kernel
if [ "$PROFILE" = "1153" ]; then
  cp contracts/Kernel1153.yul "$OUTDIR/Kernel.yul"
else
  cp contracts/KernelLegacy.yul "$OUTDIR/Kernel.yul"
fi

# build-time strip (safe, dumb, effective)
# - minimal: removes CALLV and ERC20XFER blocks if you mark them with tags.
# If you didn't add tags, this still works as "no-op".
node - <<'NODE'
const fs = require('fs');
const path = process.argv[1];
NODE

# link PM placeholder
node -e "
const fs=require('fs');
let s=fs.readFileSync('$OUTDIR/Kernel.yul','utf8');
s=s.replaceAll('__PM__', '$PM_HEX');

const flags='$FLAGS';
if(flags==='minimal'){
  // Optional: strip blocks if you add comment tags:
  // /*IF_CALLV*/ ... /*ENDIF_CALLV*/
  s=s.replace(/\/\*IF_CALLV\*\/[\\s\\S]*?\/\*ENDIF_CALLV\*\//g,'');
  s=s.replace(/\/\*IF_ERC20XFER\*\/[\\s\\S]*?\/\*ENDIF_ERC20XFER\*\//g,'');
}
fs.writeFileSync('$OUTDIR/Kernel.linked.yul', s);
"

# compile (strict assembly)
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
echo " flags   : $FLAGS"
echo " pm      : $PM_HEX"
echo " bin     : $BIN"
echo " bytes   : $BYTE_LEN"
echo " sha256  : $HASH"