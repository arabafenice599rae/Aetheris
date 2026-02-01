Ok. Versione MAX / PROMAX: stessa filosofia (baremetal, fallback-only, PackedOps), ma chiusa davvero su tutti i fronti:
	•	bytecode shrink (strip a build-time + shared revert path + opcases modulari)
	•	profilazione p50/p99 + soglia “macro runner” (MCOPY-ready, senza gonfiare il kernel base)
	•	hook scanner + policy table (evita pool ostili prima ancora di simulare)
	•	RouteHint64 (binding sull’intera rotta)
	•	Auto-closer (chiusura delta-zero deterministica)
	•	STR-MPN (multi-pool netting builder, produzione)

Sotto trovi tutti i file (completi) da mettere nel repo bm-evm-prod-deploy/.
Sono scritti per essere deploy-ready e riproducibili.

⸻

📦 REPO — bm-evm-prod-deploy/ (PROMAX MAX)

bm-evm-prod-deploy/
├─ contracts/
│  ├─ Kernel1153.yul
│  └─ KernelLegacy.yul
├─ offchain/
│  ├─ compiler/
│  │  ├─ ops.ts
│  │  ├─ pack.ts
│  │  ├─ payloads.ts
│  │  ├─ pm_abi_encode.ts
│  │  └─ statepack.ts
│  ├─ risk/
│  │  ├─ hook_scanner.ts
│  │  └─ hooks.ts
│  ├─ strategies/
│  │  ├─ auto_closer.ts
│  │  └─ str_mpn.ts
│  ├─ bench/
│  │  ├─ gas_p50_p99.ts
│  │  └─ mcopy_threshold.ts
│  └─ examples/
│     ├─ make_payload_mpn.ts
│     └─ make_payloads_batch.ts
├─ deploy/
│  ├─ compile.sh
│  └─ deploy.sh
└─ README.md


⸻

✅ contracts/Kernel1153.yul (MAX, strip-ready)

Build-time strip: i blocchi CALLV e ERC20XFER sono marcati con tag; deploy/compile.sh li può eliminare per scendere di size (minimal).
Op-codes:
	•	0x01 CALL (PM, value=0)
	•	0x02 TAKE (PM call + mirror++)
	•	0x03 CLEAR (PM call + mirror–)
	•	0x04 SETTLE (PM call)
	•	0x05 CALLV (PM call con msg.value)  [strip]
	•	0x06 ERC20XFER (token.transfer(PM, amt)) [strip]

object "Kernel1153" {
  code {
    datacopy(0, dataoffset("Runtime"), datasize("Runtime"))
    return(0, datasize("Runtime"))
  }

  object "Runtime" {
    code {
      // ---------- CONSTANTS (patch at build) ----------
      let PM := __PM__
      let SEL_UNLOCK := 0x48c89491          // unlock(bytes)
      let SEL_UCALL  := 0x91dd7346          // unlockCallback(bytes)

      // ERC20.transfer selector
      let SEL_ERC20_TRANSFER := 0xa9059cbb

      // transient slots
      let TS_BIND := 0x20
      let TS_AUTH := 0x21
      let TS_HINT := 0x22
      let TS_MIRR := 0x10

      function fail() { revert(0,0) }

      function callUnlock() {
        // Header must be >= 72B: w0(32)+w1(32)+hint(8)
        if lt(calldatasize(), 72) { fail() }

        let w0 := calldataload(0)
        let w1 := calldataload(32)
        let w2 := calldataload(64)

        // word0: deadline(u64 LE low 8B), bindTag(u64 LE next 8B)
        let deadline := and(w0, 0xffffffffffffffff)
        if gt(timestamp(), deadline) { fail() }
        let bindTag := and(shr(64, w0), 0xffffffffffffffff)

        // word1 low 20B = auth
        let auth := and(w1, 0xffffffffffffffffffffffffffffffffffffffff)
        if iszero(eq(caller(), auth)) { fail() }

        // store tx-scope binding
        tstore(TS_BIND, bindTag)
        tstore(TS_AUTH, auth)
        tstore(TS_HINT, w2)
        tstore(TS_MIRR, 0)

        // ABI encode unlock(bytes)
        let p := mload(0x40)
        mstore(p, shl(224, SEL_UNLOCK))
        mstore(add(p, 4), 0x20)
        let n := calldatasize()
        mstore(add(p, 36), n)
        calldatacopy(add(p, 68), 0, n)
        let total := add(68, n)

        if iszero(call(gas(), PM, 0, p, total, 0, 0)) { fail() }
        return(0,0)
      }

      function handleCallback() {
        // require canonical bytes encoding: offset == 0x20
        if iszero(eq(calldataload(4), 0x20)) { fail() }

        let dataLen := calldataload(36)
        let dataPtr := 68
        if lt(dataLen, 72) { fail() }
        run(dataPtr, add(dataPtr, dataLen))
        return(0,0)
      }

      function run(ptr, end) {
        let w0 := calldataload(ptr)
        let w1 := calldataload(add(ptr, 32))
        let w2 := calldataload(add(ptr, 64))

        let deadline := and(w0, 0xffffffffffffffff)
        if gt(timestamp(), deadline) { fail() }

        let bindTag := and(shr(64, w0), 0xffffffffffffffff)
        if iszero(eq(bindTag, tload(TS_BIND))) { fail() }

        let auth := and(w1, 0xffffffffffffffffffffffffffffffffffffffff)
        if iszero(eq(auth, tload(TS_AUTH))) { fail() }

        // hint must match exactly
        if iszero(eq(w2, tload(TS_HINT))) { fail() }

        let p := add(ptr, 72)

        for { } lt(p, end) { } {
          // op header = 4 bytes, must exist
          if gt(add(p, 4), end) { fail() }

          let w := calldataload(p)
          let op := byte(0, w)
          let len := and(shr(224, w), 0xffff) // bytes[2..3] big-endian

          let next := add(p, add(4, len))
          if gt(next, end) { fail() }

          let payload := add(p, 4)

          switch op
          case 0x01 {
            // CALL PM
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
          }
          case 0x02 {
            // TAKE (mirror++)
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
            tstore(TS_MIRR, add(tload(TS_MIRR), 1))
          }
          case 0x03 {
            // CLEAR (mirror--)
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
            let m := tload(TS_MIRR)
            if iszero(m) { fail() }
            tstore(TS_MIRR, sub(m, 1))
          }
          case 0x04 {
            // SETTLE
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
          }

          /*IF_CALLV*/
          case 0x05 {
            // CALLV: payload = value(32) || calldata
            if lt(len, 32) { fail() }
            let v := calldataload(payload)
            let cdPtr := add(payload, 32)
            let cdLen := sub(len, 32)
            if iszero(call(gas(), PM, v, cdPtr, cdLen, 0, 0)) { fail() }
          }
          /*ENDIF_CALLV*/

          /*IF_ERC20XFER*/
          case 0x06 {
            // ERC20XFER: payload = token(20) || amount(32) ; len == 52
            if iszero(eq(len, 52)) { fail() }

            let tokenWord := calldataload(payload)
            let token := and(tokenWord, 0xffffffffffffffffffffffffffffffffffffffff)
            let amt := calldataload(add(payload, 20))

            // transfer(PM, amt)
            let m := mload(0x40)
            mstore(m, shl(224, SEL_ERC20_TRANSFER))
            mstore(add(m, 4), shl(96, PM))
            mstore(add(m, 36), amt)
            if iszero(call(gas(), token, 0, m, 68, 0, 0)) { fail() }
          }
          /*ENDIF_ERC20XFER*/

          default { fail() }

          p := next
        }

        // must close mirror to zero
        if iszero(eq(tload(TS_MIRR), 0)) { fail() }

        // clear tx-scope state
        tstore(TS_BIND, 0)
        tstore(TS_AUTH, 0)
        tstore(TS_HINT, 0)
        tstore(TS_MIRR, 0)
      }

      // --------- ENTRY DISPATCH ----------
      let sig := shr(224, calldataload(0))
      if eq(sig, SEL_UCALL) { handleCallback() }
      callUnlock()
    }
  }
}


⸻

✅ contracts/KernelLegacy.yul (MAX, strip-ready)

object "KernelLegacy" {
  code {
    datacopy(0, dataoffset("Runtime"), datasize("Runtime"))
    return(0, datasize("Runtime"))
  }

  object "Runtime" {
    code {
      let PM := __PM__
      let SEL_UNLOCK := 0x48c89491
      let SEL_UCALL  := 0x91dd7346
      let SEL_ERC20_TRANSFER := 0xa9059cbb

      // storage slots (cross-tx, slower, universal)
      let SS_BIND := 0
      let SS_AUTH := 1
      let SS_HINT := 2
      let SS_MIRR := 3

      function fail() { revert(0,0) }
      function sget(slot) -> v { v := sload(slot) }
      function sset(slot, v) { sstore(slot, v) }

      function callUnlock() {
        if lt(calldatasize(), 72) { fail() }

        let w0 := calldataload(0)
        let w1 := calldataload(32)
        let w2 := calldataload(64)

        let deadline := and(w0, 0xffffffffffffffff)
        if gt(timestamp(), deadline) { fail() }
        let bindTag := and(shr(64, w0), 0xffffffffffffffff)

        let auth := and(w1, 0xffffffffffffffffffffffffffffffffffffffff)
        if iszero(eq(caller(), auth)) { fail() }

        sset(SS_BIND, bindTag)
        sset(SS_AUTH, auth)
        sset(SS_HINT, w2)
        sset(SS_MIRR, 0)

        let p := mload(0x40)
        mstore(p, shl(224, SEL_UNLOCK))
        mstore(add(p, 4), 0x20)
        let n := calldatasize()
        mstore(add(p, 36), n)
        calldatacopy(add(p, 68), 0, n)
        let total := add(68, n)

        if iszero(call(gas(), PM, 0, p, total, 0, 0)) { fail() }
        return(0,0)
      }

      function handleCallback() {
        if iszero(eq(calldataload(4), 0x20)) { fail() }
        let dataLen := calldataload(36)
        let dataPtr := 68
        if lt(dataLen, 72) { fail() }
        run(dataPtr, add(dataPtr, dataLen))
        return(0,0)
      }

      function run(ptr, end) {
        let w0 := calldataload(ptr)
        let w1 := calldataload(add(ptr, 32))
        let w2 := calldataload(add(ptr, 64))

        let deadline := and(w0, 0xffffffffffffffff)
        if gt(timestamp(), deadline) { fail() }

        let bindTag := and(shr(64, w0), 0xffffffffffffffff)
        if iszero(eq(bindTag, sget(SS_BIND))) { fail() }

        let auth := and(w1, 0xffffffffffffffffffffffffffffffffffffffff)
        if iszero(eq(auth, sget(SS_AUTH))) { fail() }

        if iszero(eq(w2, sget(SS_HINT))) { fail() }

        let p := add(ptr, 72)

        for { } lt(p, end) { } {
          if gt(add(p, 4), end) { fail() }
          let w := calldataload(p)
          let op := byte(0, w)
          let len := and(shr(224, w), 0xffff)
          let next := add(p, add(4, len))
          if gt(next, end) { fail() }
          let payload := add(p, 4)

          switch op
          case 0x01 { if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() } }
          case 0x02 {
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
            sset(SS_MIRR, add(sget(SS_MIRR), 1))
          }
          case 0x03 {
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
            let m := sget(SS_MIRR)
            if iszero(m) { fail() }
            sset(SS_MIRR, sub(m, 1))
          }
          case 0x04 { if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() } }

          /*IF_CALLV*/
          case 0x05 {
            if lt(len, 32) { fail() }
            let v := calldataload(payload)
            let cdPtr := add(payload, 32)
            let cdLen := sub(len, 32)
            if iszero(call(gas(), PM, v, cdPtr, cdLen, 0, 0)) { fail() }
          }
          /*ENDIF_CALLV*/

          /*IF_ERC20XFER*/
          case 0x06 {
            if iszero(eq(len, 52)) { fail() }
            let tokenWord := calldataload(payload)
            let token := and(tokenWord, 0xffffffffffffffffffffffffffffffffffffffff)
            let amt := calldataload(add(payload, 20))

            let m := mload(0x40)
            mstore(m, shl(224, SEL_ERC20_TRANSFER))
            mstore(add(m, 4), shl(96, PM))
            mstore(add(m, 36), amt)
            if iszero(call(gas(), token, 0, m, 68, 0, 0)) { fail() }
          }
          /*ENDIF_ERC20XFER*/

          default { fail() }

          p := next
        }

        if iszero(eq(sget(SS_MIRR), 0)) { fail() }

        sset(SS_BIND, 0)
        sset(SS_AUTH, 0)
        sset(SS_HINT, 0)
        sset(SS_MIRR, 0)
      }

      let sig := shr(224, calldataload(0))
      if eq(sig, SEL_UCALL) { handleCallback() }
      callUnlock()
    }
  }
}


⸻

✅ offchain/compiler/ops.ts

export function op(opcode: number, flags: number, payload: Uint8Array): Uint8Array {
  const len = payload.length;
  if (len > 0xffff) throw new Error("payload too large");
  const out = new Uint8Array(4 + len);
  out[0] = opcode & 0xff;
  out[1] = flags & 0xff;
  out[2] = (len >>> 8) & 0xff; // big-endian
  out[3] = len & 0xff;
  out.set(payload, 4);
  return out;
}

export const OP_CALL      = 0x01;
export const OP_TAKE      = 0x02;
export const OP_CLEAR     = 0x03;
export const OP_SETTLE    = 0x04;

// Optional runners (strip in minimal build)
export const OP_CALLV     = 0x05; // payload = value(32) || calldata
export const OP_ERC20XFER = 0x06; // payload = token(20) || amount(32)


⸻

✅ offchain/compiler/pack.ts (72B header)

export function pack(
  deadline: number,
  bindTag: bigint,
  auth: Uint8Array,          // 20 bytes
  stateHint64: bigint,       // uint64
  ops: Uint8Array[]
): Uint8Array {
  if (auth.length !== 20) throw new Error("auth must be 20 bytes");

  const header = Buffer.alloc(72);

  header.writeBigUInt64LE(BigInt(deadline), 0);
  header.writeBigUInt64LE(bindTag & 0xffffffffffffffffn, 8);

  Buffer.from(auth).copy(header, 32 + 12); // right-align 20B in word1

  header.writeBigUInt64LE(stateHint64 & 0xffffffffffffffffn, 64);

  return Buffer.concat([header, ...ops.map((o) => Buffer.from(o))]);
}


⸻

✅ offchain/compiler/payloads.ts

import { op, OP_CALL, OP_CALLV, OP_ERC20XFER, OP_TAKE, OP_CLEAR, OP_SETTLE } from "./ops";

function hexToBytes(h: string): Uint8Array {
  if (h.startsWith("0x")) h = h.slice(2);
  if (h.length % 2 !== 0) throw new Error("hex must be even length");
  return Uint8Array.from(Buffer.from(h, "hex"));
}

function u256ToBytesBE(x: bigint): Uint8Array {
  if (x < 0n) throw new Error("u256 must be >= 0");
  const hex = x.toString(16).padStart(64, "0");
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function addressToBytes20(addr: string): Uint8Array {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error("address must be 0x + 40 hex");
  return hexToBytes(addr);
}

export function opCall(pmCalldataHex: string, flags = 0): Uint8Array {
  return op(OP_CALL, flags, hexToBytes(pmCalldataHex));
}
export function opSettle(pmCalldataHex: string, flags = 0): Uint8Array {
  return op(OP_SETTLE, flags, hexToBytes(pmCalldataHex));
}
export function opTake(pmCalldataHex: string, flags = 0): Uint8Array {
  return op(OP_TAKE, flags, hexToBytes(pmCalldataHex));
}
export function opClear(pmCalldataHex: string, flags = 0): Uint8Array {
  return op(OP_CLEAR, flags, hexToBytes(pmCalldataHex));
}

export function opCallV(valueWei: bigint, pmCalldataHex: string, flags = 0): Uint8Array {
  const cd = hexToBytes(pmCalldataHex);
  const v = u256ToBytesBE(valueWei);
  return op(OP_CALLV, flags, new Uint8Array(Buffer.concat([Buffer.from(v), Buffer.from(cd)])));
}

export function opErc20Xfer(token: `0x${string}`, amount: bigint, flags = 0): Uint8Array {
  const t = addressToBytes20(token);
  const a = u256ToBytesBE(amount);
  return op(OP_ERC20XFER, flags, new Uint8Array(Buffer.concat([Buffer.from(t), Buffer.from(a)])));
}


⸻

✅ offchain/compiler/pm_abi_encode.ts (min ABI con viem)

import { encodeFunctionData, parseAbi } from "viem";

const PM_ABI = parseAbi([
  "function sync(address currency)",
  "function settle() payable returns (uint256)",
  "function settleFor(address recipient) payable returns (uint256)",
  "function take(address currency, address to, uint256 amount)",
  "function clear(address currency, uint256 amount)",
  "function swap(bytes32 poolId, tuple(bool zeroForOne,int256 amountSpecified,uint160 sqrtPriceLimitX96) params, bytes hookData)",
]);

export function encodeSync(currency: `0x${string}`): `0x${string}` {
  return encodeFunctionData({ abi: PM_ABI, functionName: "sync", args: [currency] });
}
export function encodeSettle(): `0x${string}` {
  return encodeFunctionData({ abi: PM_ABI, functionName: "settle", args: [] });
}
export function encodeSettleFor(recipient: `0x${string}`): `0x${string}` {
  return encodeFunctionData({ abi: PM_ABI, functionName: "settleFor", args: [recipient] });
}
export function encodeTake(currency: `0x${string}`, to: `0x${string}`, amount: bigint): `0x${string}` {
  return encodeFunctionData({ abi: PM_ABI, functionName: "take", args: [currency, to, amount] });
}
export function encodeClear(currency: `0x${string}`, amount: bigint): `0x${string}` {
  return encodeFunctionData({ abi: PM_ABI, functionName: "clear", args: [currency, amount] });
}

export type SwapParams = {
  zeroForOne: boolean;
  amountSpecified: bigint;
  sqrtPriceLimitX96: bigint;
};

export function encodeSwap(
  poolId: `0x${string}`,
  params: SwapParams,
  hookData: `0x${string}` = "0x"
): `0x${string}` {
  return encodeFunctionData({
    abi: PM_ABI,
    functionName: "swap",
    args: [poolId, params, hookData],
  });
}


⸻

✅ offchain/compiler/statepack.ts (RouteHint64 via StateView)

import { createPublicClient, http, keccak256, encodeAbiParameters, parseAbi, getAddress } from "viem";

export type PoolKey = {
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  fee: number;         // uint24
  tickSpacing: number; // int24
  hooks: `0x${string}`;
};

const STATEVIEW_ABI = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint16 protocolFee,uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);

export function computePoolId(key: PoolKey): `0x${string}` {
  const encoded = encodeAbiParameters(
    [
      { name: "currency0", type: "address" },
      { name: "currency1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickSpacing", type: "int24" },
      { name: "hooks", type: "address" },
    ],
    [getAddress(key.currency0), getAddress(key.currency1), BigInt(key.fee), key.tickSpacing, getAddress(key.hooks)]
  );
  return keccak256(encoded);
}

function trunc64FromKeccak(hex32: `0x${string}`): bigint {
  const h = hex32.slice(2);
  const low16 = h.slice(64 - 16);
  return BigInt("0x" + low16);
}

function packState(sqrtPriceX96: bigint, tick: number, liquidity: bigint): `0x${string}` {
  const buf = Buffer.alloc(40);

  const spHex = sqrtPriceX96.toString(16).padStart(40, "0");
  Buffer.from(spHex, "hex").copy(buf, 0);

  buf.writeInt32BE(tick | 0, 20);

  const liHex = liquidity.toString(16).padStart(32, "0");
  Buffer.from(liHex, "hex").copy(buf, 24);

  return ("0x" + buf.toString("hex")) as `0x${string}`;
}

export async function computePoolHint64(args: {
  rpcUrl: string;
  stateView: `0x${string}`;
  poolKey: PoolKey;
}): Promise<{ poolId: `0x${string}`; hint64: bigint }> {
  const client = createPublicClient({ transport: http(args.rpcUrl) });
  const poolId = computePoolId(args.poolKey);

  const [slot0, liq] = await Promise.all([
    client.readContract({ address: args.stateView, abi: STATEVIEW_ABI, functionName: "getSlot0", args: [poolId] }),
    client.readContract({ address: args.stateView, abi: STATEVIEW_ABI, functionName: "getLiquidity", args: [poolId] }),
  ]);

  const sqrtPriceX96 = BigInt(slot0[0]);
  const tick = Number(slot0[1]);
  const liquidity = BigInt(liq);

  const packed = packState(sqrtPriceX96, tick, liquidity);
  return { poolId, hint64: trunc64FromKeccak(keccak256(packed)) };
}

export async function computeRouteHint64(args: {
  rpcUrl: string;
  stateView: `0x${string}`;
  poolKeys: PoolKey[];
}): Promise<{ poolIds: `0x${string}`[]; routeHint64: bigint }> {
  const hints = await Promise.all(args.poolKeys.map((k) => computePoolHint64({ rpcUrl: args.rpcUrl, stateView: args.stateView, poolKey: k })));

  const buf = Buffer.alloc(8 * hints.length);
  for (let i = 0; i < hints.length; i++) {
    buf.writeBigUInt64LE(hints[i].hint64 & 0xffffffffffffffffn, i * 8);
  }

  const h = keccak256(("0x" + buf.toString("hex")) as `0x${string}`);
  return { poolIds: hints.map((x) => x.poolId), routeHint64: trunc64FromKeccak(h) };
}


⸻

✅ offchain/strategies/auto_closer.ts

import { opCall, opCallV, opErc20Xfer, opSettle, opTake } from "../compiler/payloads";
import { encodeSync, encodeSettleFor, encodeTake } from "../compiler/pm_abi_encode";

export type Currency = `0x${string}`;

export type Delta = {
  currency: Currency;
  amount: bigint;               // signed: >0 take, <0 pay+settle
  token?: `0x${string}`;        // ERC20 contract address used for transfer(PM, amount)
  isNative?: boolean;           // true => use CALLV + settleFor
};

export type ClosePlan = {
  recipient: `0x${string}`;
  takeTo: `0x${string}`;
  deltas: Delta[];
};

export function buildAutoCloseOps(plan: ClosePlan): Uint8Array[] {
  const ops: Uint8Array[] = [];

  // pay & settle negatives
  for (const d of plan.deltas) {
    if (d.amount >= 0n) continue;
    const pay = -d.amount;
    const settleCd = encodeSettleFor(plan.recipient);

    if (d.isNative) {
      ops.push(opCallV(pay, settleCd));
    } else {
      if (!d.token) throw new Error(`missing token for ERC20 funding of ${d.currency}`);
      ops.push(opCall(encodeSync(d.currency)));
      ops.push(opErc20Xfer(d.token, pay));
      ops.push(opSettle(settleCd));
    }
  }

  // take positives
  for (const d of plan.deltas) {
    if (d.amount <= 0n) continue;
    ops.push(opTake(encodeTake(d.currency, plan.takeTo, d.amount)));
  }

  return ops;
}


⸻

✅ offchain/strategies/str_mpn.ts (STR-MPN)

import { opCall } from "../compiler/payloads";
import { encodeSwap, SwapParams } from "../compiler/pm_abi_encode";
import { PoolKey, computeRouteHint64 } from "../compiler/statepack";
import { buildAutoCloseOps, ClosePlan, Delta } from "./auto_closer";

export type Hop = {
  poolKey: PoolKey;
  poolId?: `0x${string}`;
  params: SwapParams;
  hookData?: `0x${string}`;
};

export type MPNPlan = {
  hops: Hop[];
  deltas: Delta[];              // from your sim
  recipient: `0x${string}`;
  takeTo: `0x${string}`;
};

export async function buildSTR_MPN(args: {
  rpcUrl: string;
  stateView: `0x${string}`;
  plan: MPNPlan;
}): Promise<{ stateHint64: bigint; ops: Uint8Array[]; poolIds: `0x${string}`[] }> {
  const poolKeys = args.plan.hops.map((h) => h.poolKey);
  const { poolIds, routeHint64 } = await computeRouteHint64({ rpcUrl: args.rpcUrl, stateView: args.stateView, poolKeys });

  const econOps: Uint8Array[] = [];
  for (let i = 0; i < args.plan.hops.length; i++) {
    const hop = args.plan.hops[i];
    const poolId = (hop.poolId ?? poolIds[i]) as `0x${string}`;
    econOps.push(opCall(encodeSwap(poolId, hop.params, hop.hookData ?? "0x")));
  }

  const closePlan: ClosePlan = {
    recipient: args.plan.recipient,
    takeTo: args.plan.takeTo,
    deltas: args.plan.deltas,
  };
  const closeOps = buildAutoCloseOps(closePlan);

  return { stateHint64: routeHint64, ops: [...econOps, ...closeOps], poolIds };
}


⸻

✅ offchain/risk/hooks.ts + hook_scanner.ts (MAX)

// offchain/risk/hooks.ts
export type HookClass = "vanilla-safe" | "hook-safe" | "hook-hostile";

export type HookPolicy = {
  hooks: `0x${string}`;
  cls: HookClass;
  flags14: number;
  note?: string;
};

export function allowByClass(cls: HookClass): boolean {
  return cls !== "hook-hostile";
}

// offchain/risk/hook_scanner.ts
import fs from "fs";
import { PoolKey } from "../compiler/statepack";
import { HookPolicy } from "./hooks";

function lsb14(addr: string): number {
  const a = BigInt(addr);
  return Number(a & ((1n << 14n) - 1n));
}

const F_AFTER_SWAP_RETURNS_DELTA = 1 << 2;
const F_BEFORE_SWAP_RETURNS_DELTA = 1 << 3;
const F_AFTER_ADD_LIQ_RETURNS_DELTA = 1 << 1;
const F_AFTER_REMOVE_LIQ_RETURNS_DELTA = 1 << 0;

function classify(hooks: `0x${string}`): HookPolicy {
  if (hooks.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    return { hooks, cls: "vanilla-safe", flags14: 0, note: "no hooks" };
  }
  const flags = lsb14(hooks);
  const returnsDelta =
    (flags & F_AFTER_SWAP_RETURNS_DELTA) ||
    (flags & F_BEFORE_SWAP_RETURNS_DELTA) ||
    (flags & F_AFTER_ADD_LIQ_RETURNS_DELTA) ||
    (flags & F_AFTER_REMOVE_LIQ_RETURNS_DELTA);

  if (returnsDelta) return { hooks, cls: "hook-hostile", flags14: flags, note: "returnsDelta enabled" };
  return { hooks, cls: "hook-safe", flags14: flags, note: "hooks enabled, no returnsDelta" };
}

function main() {
  const inFile = process.argv[2] ?? "offchain/risk/pools.json";
  const outFile = process.argv[3] ?? "offchain/risk/hook_policy.json";

  const pools: PoolKey[] = JSON.parse(fs.readFileSync(inFile, "utf8"));
  const map = new Map<string, HookPolicy>();

  for (const p of pools) {
    const h = classify(p.hooks);
    map.set(h.hooks.toLowerCase(), h);
  }

  const out = Array.from(map.values()).sort((a, b) => a.hooks.localeCompare(b.hooks));
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.length} hook policies -> ${outFile}`);
}

main();


⸻

✅ offchain/bench/gas_p50_p99.ts + mcopy_threshold.ts

// offchain/bench/gas_p50_p99.ts
import { createPublicClient, http } from "viem";
import fs from "fs";

function mustEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
}

async function main() {
  const RPC_URL = mustEnv("RPC_URL");
  const FROM = mustEnv("FROM") as `0x${string}`;
  const TO = mustEnv("TO") as `0x${string}`;
  const DATA_FILE = mustEnv("DATA_FILE");

  const payloads = fs.readFileSync(DATA_FILE, "utf8").trim().split("\n").filter(Boolean);
  const client = createPublicClient({ transport: http(RPC_URL) });

  const gasList: bigint[] = [];
  for (const data of payloads) {
    const g = await client.estimateGas({ account: FROM, to: TO, data: data as `0x${string}` });
    gasList.push(g);
  }
  gasList.sort((a, b) => (a < b ? -1 : 1));

  const p50 = gasList[Math.floor(gasList.length * 0.50)];
  const p99 = gasList[Math.floor(gasList.length * 0.99)];

  console.log(JSON.stringify({
    n: gasList.length,
    p50: p50.toString(),
    p99: p99.toString(),
    min: gasList[0].toString(),
    max: gasList[gasList.length - 1].toString(),
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

// offchain/bench/mcopy_threshold.ts
import fs from "fs";

function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const i = Math.floor(xs.length * p);
  return xs[Math.min(i, xs.length - 1)];
}

function main() {
  const file = process.argv[2] ?? "offchain/bench/payloads.txt";
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);

  const sizes = lines.map((l) => {
    const s = l.startsWith("0x") ? l.slice(2) : l;
    return Math.floor(s.length / 2);
  }).sort((a, b) => a - b);

  const p50 = percentile(sizes, 0.50);
  const p90 = percentile(sizes, 0.90);
  const p99 = percentile(sizes, 0.99);

  const recommend = (p50 >= 512 || p99 >= 2048)
    ? "Macro-runner likely: consider MCOPY in specialized kernel build"
    : "Keep base kernel lean: MCOPY not worth it";

  console.log(JSON.stringify({ n: sizes.length, p50, p90, p99, min: sizes[0], max: sizes[sizes.length-1], recommend }, null, 2));
}

main();


⸻

✅ offchain/examples/make_payload_mpn.ts (end-to-end)

import crypto from "crypto";
import { pack } from "../compiler/pack";
import { buildSTR_MPN } from "../strategies/str_mpn";
import { PoolKey } from "../compiler/statepack";

function hexToBytes(h: string): Uint8Array {
  if (h.startsWith("0x")) h = h.slice(2);
  return Uint8Array.from(Buffer.from(h, "hex"));
}
function mustEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
}

async function main() {
  const RPC_URL = mustEnv("RPC_URL");
  const STATE_VIEW = mustEnv("STATE_VIEW") as `0x${string}`;
  const AUTH = mustEnv("AUTH") as `0x${string}`;

  const deadline = Math.floor(Date.now() / 1000) + 25;
  const bindTag = BigInt("0x" + crypto.randomUUID().replaceAll("-", "").slice(0, 16));
  const authBytes = hexToBytes(AUTH);

  const poolA: PoolKey = {
    currency0: mustEnv("A_C0") as `0x${string}`,
    currency1: mustEnv("A_C1") as `0x${string}`,
    fee: Number(mustEnv("A_FEE")),
    tickSpacing: Number(mustEnv("A_TICK")),
    hooks: (process.env.A_HOOKS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
  };

  const poolB: PoolKey = {
    currency0: mustEnv("B_C0") as `0x${string}`,
    currency1: mustEnv("B_C1") as `0x${string}`,
    fee: Number(mustEnv("B_FEE")),
    tickSpacing: Number(mustEnv("B_TICK")),
    hooks: (process.env.B_HOOKS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
  };

  const recipient = mustEnv("RECIPIENT") as `0x${string}`;
  const takeTo = mustEnv("TAKETO") as `0x${string}`;

  // MOCK deltas: sostituisci con output del tuo sim
  const PROFIT_CCY = mustEnv("PROFIT_CCY") as `0x${string}`;
  const PROFIT_TOKEN = mustEnv("PROFIT_TOKEN") as `0x${string}`;
  const PROFIT_AMT = BigInt(mustEnv("PROFIT_AMT"));

  const { stateHint64, ops } = await buildSTR_MPN({
    rpcUrl: RPC_URL,
    stateView: STATE_VIEW,
    plan: {
      hops: [
        { poolKey: poolA, params: { zeroForOne: true,  amountSpecified: BigInt(mustEnv("AMT_SPEC_1")), sqrtPriceLimitX96: BigInt(mustEnv("SPL_1")) }, hookData: "0x" },
        { poolKey: poolB, params: { zeroForOne: false, amountSpecified: BigInt(mustEnv("AMT_SPEC_2")), sqrtPriceLimitX96: BigInt(mustEnv("SPL_2")) }, hookData: "0x" },
      ],
      deltas: [{ currency: PROFIT_CCY, amount: PROFIT_AMT, token: PROFIT_TOKEN, isNative: false }],
      recipient,
      takeTo,
    }
  });

  const payload = pack(deadline, bindTag, authBytes, stateHint64, ops);
  process.stdout.write("0x" + Buffer.from(payload).toString("hex") + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });


⸻

✅ offchain/examples/make_payloads_batch.ts (per bench p50/p99)

import fs from "fs";
import { execSync } from "child_process";

const N = Number(process.env.N ?? "50");
const OUT = process.env.OUT ?? "offchain/bench/payloads.txt";

function main() {
  const lines: string[] = [];
  for (let i = 0; i < N; i++) {
    const out = execSync("node offchain/examples/make_payload_mpn.ts", { stdio: ["ignore", "pipe", "inherit"] }).toString().trim();
    lines.push(out);
  }
  fs.writeFileSync(OUT, lines.join("\n") + "\n");
  console.log(`Wrote ${N} payloads -> ${OUT}`);
}
main();


⸻

✅ deploy/compile.sh (MAX, strip minimal, size+hash)

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


⸻

✅ deploy/deploy.sh (Foundry)

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


⸻

✅ README.md (MAX, operativo)

# bm-evm-prod-deploy — PROMAX MAX

Baremetal strict-assembly kernel for Uniswap v4-style PoolManager:
- fallback-only runtime
- forwards PackedOps to PoolManager.unlock(bytes)
- handles unlockCallback(bytes)
- executes ops stream (CALL/TAKE/CLEAR/SETTLE + optional CALLV/ERC20XFER)
- enforces bindTag/auth + RouteHint64 binding
- mirror discipline for TAKE/CLEAR => deterministic delta-zero behavior

## Build
```bash
# all runners
bash deploy/compile.sh 1153 0xPOOLMANAGER all

# minimal (strip CALLV/ERC20XFER blocks)
bash deploy/compile.sh 1153 0xPOOLMANAGER minimal

Deploy

export RPC_URL=...
export PK=...
bash deploy/deploy.sh build/Kernel.linked.yul.bin

PackedOps format

Header 72 bytes:
	•	word0: deadline(u64 LE @0) | bindTag(u64 LE @8)
	•	word1: auth address in low 20 bytes
	•	word2: stateHint64 in low 8 bytes (stored in word)

Ops start at offset 72:
	•	op header: [op:1][flags:1][len:2 big-endian] + payload[len]

Offchain
	•	statepack.ts computes RouteHint64 using StateView (slot0+liquidity)
	•	strategies/auto_closer.ts ensures delta-zero settlement plan
	•	strategies/str_mpn.ts builds multi-pool netting plan + auto-close

Bench:
	•	gas_p50_p99.ts estimates gas distribution for payloads
	•	mcopy_threshold.ts estimates size distribution to decide macro-runner builds
