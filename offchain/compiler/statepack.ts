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