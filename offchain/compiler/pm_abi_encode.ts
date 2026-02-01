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
  amountSpecified: bigint;     // int256
  sqrtPriceLimitX96: bigint;   // uint160
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