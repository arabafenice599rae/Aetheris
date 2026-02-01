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