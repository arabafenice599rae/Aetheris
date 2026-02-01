import { SEL } from "../compiler/selectors";
import {
  PoolKey, ModifyLiquidityParams, SwapParams,
  encPoolKey, encModifyLiquidityParams, encSwapParams,
  abiEncode, dynBytesArg, addrArg, uintArg
} from "../compiler/abi";
import { hexToBytes } from "../compiler/ops";

function withSelector(sel:string, argsHexNo0x:string): Uint8Array {
  return hexToBytes(sel + argsHexNo0x);
}

function dynTail(hookData:`0x${string}`){
  const hd = hookData.startsWith("0x") ? hookData : ("0x"+hookData);
  return dynBytesArg(hd as any);
}

export function cd_sync(currency:`0x${string}`): Uint8Array {
  const args = abiEncode([addrArg(currency)]);
  return withSelector(SEL.sync, args);
}

export function cd_settle(): Uint8Array {
  return hexToBytes(SEL.settle);
}

export function cd_settleFor(recipient:`0x${string}`): Uint8Array {
  const args = abiEncode([addrArg(recipient)]);
  return withSelector(SEL.settleFor, args);
}

export function cd_take(currency:`0x${string}`, to:`0x${string}`, amount:bigint): Uint8Array {
  const args = abiEncode([addrArg(currency), addrArg(to), uintArg(amount)]);
  return withSelector(SEL.take, args);
}

export function cd_clear(currency:`0x${string}`, amount:bigint): Uint8Array {
  const args = abiEncode([addrArg(currency), uintArg(amount)]);
  return withSelector(SEL.clear, args);
}

export function cd_donate(key:PoolKey, amount0:bigint, amount1:bigint, hookData:`0x${string}`): Uint8Array {
  const keyHex = encPoolKey(key);
  const args = abiEncode([
    { head:keyHex.slice(0,64), isDyn:false },
    { head:keyHex.slice(64,128), isDyn:false },
    { head:keyHex.slice(128,192), isDyn:false },
    { head:keyHex.slice(192,256), isDyn:false },
    { head:keyHex.slice(256,320), isDyn:false },
    uintArg(amount0),
    uintArg(amount1),
    dynTail(hookData),
  ]);
  return withSelector(SEL.donate, args);
}

export function cd_modifyLiquidity(key:PoolKey, p:ModifyLiquidityParams, hookData:`0x${string}`): Uint8Array {
  const keyHex = encPoolKey(key);
  const pHex = encModifyLiquidityParams(p);
  const args = abiEncode([
    { head:keyHex.slice(0,64), isDyn:false },
    { head:keyHex.slice(64,128), isDyn:false },
    { head:keyHex.slice(128,192), isDyn:false },
    { head:keyHex.slice(192,256), isDyn:false },
    { head:keyHex.slice(256,320), isDyn:false },
    { head:pHex.slice(0,64), isDyn:false },
    { head:pHex.slice(64,128), isDyn:false },
    { head:pHex.slice(128,192), isDyn:false },
    { head:pHex.slice(192,256), isDyn:false },
    dynTail(hookData),
  ]);
  return withSelector(SEL.modifyLiquidity, args);
}

export function cd_swap(key:PoolKey, p:SwapParams, hookData:`0x${string}`): Uint8Array {
  const keyHex = encPoolKey(key);
  const pHex = encSwapParams(p);
  const args = abiEncode([
    { head:keyHex.slice(0,64), isDyn:false },
    { head:keyHex.slice(64,128), isDyn:false },
    { head:keyHex.slice(128,192), isDyn:false },
    { head:keyHex.slice(192,256), isDyn:false },
    { head:keyHex.slice(256,320), isDyn:false },
    { head:pHex.slice(0,64), isDyn:false },
    { head:pHex.slice(64,128), isDyn:false },
    { head:pHex.slice(128,192), isDyn:false },
    dynTail(hookData),
  ]);
  return withSelector(SEL.swap, args);
}