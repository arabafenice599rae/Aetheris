import { encodeFunctionData, parseAbi } from "viem";

// === Minimal ABI for PoolManager (only what we need) ===
const PM_ABI = parseAbi([
  // settlement
  "function sync(address currency)",
  "function settle() payable returns (uint256)",
  "function settleFor(address recipient) payable returns (uint256)",

  // delta ops
  "function take(address currency, address to, uint256 amount)",
  "function clear(address currency, uint256 amount)",

  // liquidity / swap primitives (optional but useful)
  "function donate(bytes32 key, uint256 amount0, uint256 amount1, bytes hookData)",
  "function modifyLiquidity(bytes32 key, int256 liquidityDelta, bytes hookData)",
  "function swap(bytes32 key, tuple(bool zeroForOne,int256 amountSpecified,uint160 sqrtPriceLimitX96) params, bytes hookData)"
]);

// ---------- Settlement ----------

export function encodeSync(currency: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: PM_ABI,
    functionName: "sync",
    args: [currency],
  });
}

export function encodeSettle(): `0x${string}` {
  return encodeFunctionData({
    abi: PM_ABI,
    functionName: "settle",
    args: [],
  });
}

export function encodeSettleFor(recipient: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: PM_ABI,
    functionName: "settleFor",
    args: [recipient],
  });
}

// ---------- Delta management ----------

export function encodeTake(
  currency: `0x${string}`,
  to: `0x${string}`,
  amount: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: PM_ABI,
    functionName: "take",
    args: [currency, to, amount],
  });
}

export function encodeClear(
  currency: `0x${string}`,
  amount: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: PM_ABI,
    functionName: "clear",
    args: [currency, amount],
  });
}

// ---------- Optional helpers for strategies ----------

export function encodeDonate(
  key: `0x${string}`,
  amount0: bigint,
  amount1: bigint,
  hookData: `0x${string}` = "0x"
): `0x${string}` {
  return encodeFunctionData({
    abi: PM_ABI,
    functionName: "donate",
    args: [key, amount0, amount1, hookData],
  });
}

export function encodeModifyLiquidity(
  key: `0x${string}`,
  liquidityDelta: bigint,
  hookData: `0x${string}` = "0x"
): `0x${string}` {
  return encodeFunctionData({
    abi: PM_ABI,
    functionName: "modifyLiquidity",
    args: [key, liquidityDelta, hookData],
  });
}