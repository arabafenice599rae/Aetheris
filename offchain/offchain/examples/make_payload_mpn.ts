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

  // Example route (fill with real pool keys)
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

  // Mock deltas: (your sim must output real deltas!)
  // Example: end with +profit in USDT, nothing else
  const profitCurrency = mustEnv("PROFIT_CCY") as `0x${string}`;
  const profitToken = mustEnv("PROFIT_TOKEN") as `0x${string}`;
  const profitAmt = BigInt(mustEnv("PROFIT_AMT"));

  const { stateHint64, ops } = await buildSTR_MPN({
    rpcUrl: RPC_URL,
    stateView: STATE_VIEW,
    plan: {
      hops: [
        {
          poolKey: poolA,
          params: {
            zeroForOne: true,
            amountSpecified: BigInt(mustEnv("AMT_SPEC_1")),     // int256
            sqrtPriceLimitX96: BigInt(mustEnv("SPL_1")),        // uint160
          },
          hookData: "0x",
        },
        {
          poolKey: poolB,
          params: {
            zeroForOne: false,
            amountSpecified: BigInt(mustEnv("AMT_SPEC_2")),
            sqrtPriceLimitX96: BigInt(mustEnv("SPL_2")),
          },
          hookData: "0x",
        }
      ],
      deltas: [
        { currency: profitCurrency, amount: profitAmt, token: profitToken, isNative: false },
      ],
      recipient,
      takeTo,
    }
  });

  const payload = pack(deadline, bindTag, authBytes, stateHint64, ops);
  process.stdout.write("0x" + Buffer.from(payload).toString("hex") + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });