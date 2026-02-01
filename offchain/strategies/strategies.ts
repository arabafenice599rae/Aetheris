import {
  op, cat, hexToBytes,
  OP_CALL, OP_TAKE, OP_CLEAR, OP_SETTLE, OP_ERC20XFER, OP_CALLV
} from "../compiler/ops";
import { PoolKey, ModifyLiquidityParams, SwapParams } from "../compiler/abi";
import {
  cd_modifyLiquidity, cd_swap, cd_donate,
  cd_sync, cd_settle, cd_settleFor,
  cd_take, cd_clear
} from "./pm_calldata";

export function PMCALL(cd: Uint8Array) { return op(OP_CALL, 0, cd); }
export function TAKE(cd: Uint8Array)   { return op(OP_TAKE, 0, cd); }
export function CLEAR(cd: Uint8Array)  { return op(OP_CLEAR, 0, cd); }
export function PMSETTLE(cd: Uint8Array){ return op(OP_SETTLE, 0, cd); }

// ERC20XFER payload = [token:20][amount:32]
export function ERC20XFER(token:`0x${string}`, amount: bigint) {
  const t = hexToBytes(token);
  if (t.length !== 20) throw new Error("bad token");
  const a = hexToBytes("0x" + amount.toString(16).padStart(64,"0"));
  return op(OP_ERC20XFER, 0, cat(t, a));
}

// CALLV payload = [value:32][calldata...]
export function PMCALLV(valueWei: bigint, cd: Uint8Array) {
  const v = hexToBytes("0x" + valueWei.toString(16).padStart(64,"0"));
  return op(OP_CALLV, 0, cat(v, cd));
}

// ---------------- STRATEGIES ----------------

export function STR01_PokeFees(
  key: PoolKey,
  tickLower: number,
  tickUpper: number,
  salt: `0x${string}`,
  hookData: `0x${string}`
) {
  const params: ModifyLiquidityParams = { tickLower, tickUpper, liquidityDelta: 0n, salt };
  return [ PMCALL(cd_modifyLiquidity(key, params, hookData)) ];
}

export function STR02_MultiPoke(
  key: PoolKey,
  pokes: {tickLower:number; tickUpper:number; salt:`0x${string}`; hookData:`0x${string}`}[]
) {
  return pokes.flatMap(p => STR01_PokeFees(key, p.tickLower, p.tickUpper, p.salt, p.hookData));
}

export function STR03_DonateThenPoke(
  key: PoolKey,
  donate0: bigint,
  donate1: bigint,
  hookDataDonate: `0x${string}`,
  tickLower: number,
  tickUpper: number,
  salt: `0x${string}`,
  hookDataPoke: `0x${string}`
) {
  return [
    PMCALL(cd_donate(key, donate0, donate1, hookDataDonate)),
    ...STR01_PokeFees(key, tickLower, tickUpper, salt, hookDataPoke)
  ];
}

export function STR04_Swap(key: PoolKey, params: SwapParams, hookData: `0x${string}`) {
  return [ PMCALL(cd_swap(key, params, hookData)) ];
}

export function STR05_SwapThenPoke(
  key: PoolKey,
  swapParams: SwapParams,
  hookDataSwap: `0x${string}`,
  tickLower: number,
  tickUpper: number,
  salt: `0x${string}`,
  hookDataPoke: `0x${string}`
) {
  return [
    ...STR04_Swap(key, swapParams, hookDataSwap),
    ...STR01_PokeFees(key, tickLower, tickUpper, salt, hookDataPoke)
  ];
}

export function STR06_TickCrossProbe(
  key: PoolKey,
  swapParams: SwapParams,
  hookDataSwap: `0x${string}`,
  poke: {tickLower:number; tickUpper:number; salt:`0x${string}`; hookData:`0x${string}`}
) {
  return [
    ...STR04_Swap(key, swapParams, hookDataSwap),
    ...STR01_PokeFees(key, poke.tickLower, poke.tickUpper, poke.salt, poke.hookData)
  ];
}

/**
 * STR07: FULL ERC20 SETTLE IN
 * sync(currency) -> ERC20 transfer(PM,amount) -> settleFor(recipient)
 */
export function STR07_SettleERC20In(
  currency:`0x${string}`,
  token:`0x${string}`,
  amountIn: bigint,
  recipient:`0x${string}`
) {
  return [
    PMCALL(cd_sync(currency)),
    ERC20XFER(token, amountIn),
    PMCALL(cd_settleFor(recipient))
  ];
}

/**
 * STR08: FULL NATIVE SETTLE IN (value)
 * Uses CALLV to call PM.settle() or PM.settleFor(recipient) with msg.value
 */
export function STR08_SettleNativeIn(valueWei: bigint, recipient?: `0x${string}`) {
  if (recipient) return [ PMCALLV(valueWei, cd_settleFor(recipient)) ];
  return [ PMCALLV(valueWei, cd_settle()) ];
}

export function STR09_TakeAndClear(currency:`0x${string}`, to:`0x${string}`, amount: bigint) {
  return [ TAKE(cd_take(currency, to, amount)), CLEAR(cd_clear(currency, amount)) ];
}

export function STR10_SwapWithNetting(
  key: PoolKey,
  swapParams: SwapParams,
  hookDataSwap: `0x${string}`,
  payIns: {currency:`0x${string}`; token:`0x${string}`; amount:bigint; recipient:`0x${string}`}[],
  takeOuts: {currency:`0x${string}`; to:`0x${string}`; amount:bigint}[],
  nativeValueWei?: bigint,
  nativeRecipient?: `0x${string}`
) {
  const ops: Uint8Array[] = [];
  ops.push(...STR04_Swap(key, swapParams, hookDataSwap));
  for (const p of payIns) ops.push(...STR07_SettleERC20In(p.currency, p.token, p.amount, p.recipient));
  if (nativeValueWei !== undefined) ops.push(...STR08_SettleNativeIn(nativeValueWei, nativeRecipient));
  for (const t of takeOuts) ops.push(...STR09_TakeAndClear(t.currency, t.to, t.amount));
  return ops;
}

export function STR11_MultiPoolBatch(
  steps: { kind:"swap"|"poke"|"donate"; key:PoolKey; hookData:`0x${string}`; swapParams?:SwapParams; donate0?:bigint; donate1?:bigint; poke?:{tickLower:number; tickUpper:number; salt:`0x${string}`;} }[],
  netting: {
    payIns: {currency:`0x${string}`; token:`0x${string}`; amount:bigint; recipient:`0x${string}`}[],
    takeOuts: {currency:`0x${string}`; to:`0x${string}`; amount:bigint}[],
    nativeValueWei?: bigint,
    nativeRecipient?: `0x${string}`
  }
) {
  const ops: Uint8Array[] = [];
  for (const s of steps) {
    if (s.kind === "swap") ops.push(...STR04_Swap(s.key, s.swapParams!, s.hookData));
    if (s.kind === "poke") ops.push(...STR01_PokeFees(s.key, s.poke!.tickLower, s.poke!.tickUpper, s.poke!.salt, s.hookData));
    if (s.kind === "donate") ops.push(PMCALL(cd_donate(s.key, s.donate0!, s.donate1!, s.hookData)));
  }
  for (const p of netting.payIns) ops.push(...STR07_SettleERC20In(p.currency, p.token, p.amount, p.recipient));
  if (netting.nativeValueWei !== undefined) ops.push(...STR08_SettleNativeIn(netting.nativeValueWei, netting.nativeRecipient));
  for (const t of netting.takeOuts) ops.push(...STR09_TakeAndClear(t.currency, t.to, t.amount));
  return ops;
}

export function STR12_ProbeStatic(pmCallData: Uint8Array) {
  return [ PMCALL(pmCallData) ];
}