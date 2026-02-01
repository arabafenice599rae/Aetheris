import { createPublicClient, http, getContract, keccak256, encodeAbiParameters, parseAbi } from "viem";

export type PoolKey = {
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  fee: number;         // uint24
  tickSpacing: number; // int24
  hooks: `0x${string}`;
};

const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) external view returns (uint128 liquidity)",
  "function getFeeGrowthGlobals(bytes32 poolId) external view returns (uint256 feeGrowthGlobal0X128, uint256 feeGrowthGlobal1X128)"
]);

export function computePoolId(key: PoolKey): `0x${string}` {
  const encoded = encodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "uint24"  },
      { type: "int24"   },
      { type: "address" },
    ],
    [key.currency0, key.currency1, BigInt(key.fee), key.tickSpacing, key.hooks]
  );
  return keccak256(encoded);
}

export async function computeStateHint64(opts: {
  rpcUrl: string;
  stateView: `0x${string}`;
  poolKey: PoolKey;
}): Promise<bigint> {
  const client = createPublicClient({ transport: http(opts.rpcUrl) });
  const poolId = computePoolId(opts.poolKey);

  const stateView = getContract({
    address: opts.stateView,
    abi: stateViewAbi,
    client
  });

  const [slot0, liq, fg] = await Promise.all([
    stateView.read.getSlot0([poolId]),
    stateView.read.getLiquidity([poolId]),
    stateView.read.getFeeGrowthGlobals([poolId]),
  ]);

  const [sqrtPriceX96, tick, protocolFee, lpFee] =
    slot0 as unknown as [bigint, number, number, number];

  const liquidity = liq as unknown as bigint;
  const [fg0, fg1] = fg as unknown as [bigint, bigint];

  // Minimal deterministic state-pack
  const pack = encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "uint160" },
      { type: "int24"   },
      { type: "uint24"  },
      { type: "uint24"  },
      { type: "uint128" },
      { type: "uint256" },
      { type: "uint256" },
    ],
    [
      poolId,
      sqrtPriceX96,
      tick,
      BigInt(protocolFee),
      BigInt(lpFee),
      liquidity,
      fg0,
      fg1
    ]
  );

  const h = keccak256(pack);

  // low 8 bytes of hash
  const hintHex = "0x" + h.slice(2 + 64 - 16);
  return BigInt(hintHex);
}