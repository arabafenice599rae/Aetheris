import crypto from "crypto";
import { pack } from "../compiler/pack";
import { op, OP_CALL } from "../compiler/ops";
import { computeStateHint64, PoolKey } from "../compiler/statepack";

function hexToBytes(h: string): Uint8Array {
  if (h.startsWith("0x")) h = h.slice(2);
  return Uint8Array.from(Buffer.from(h, "hex"));
}

async function main() {
  const RPC_URL = process.env.RPC_URL!;
  const AUTH_ADDR = process.env.AUTH!; // 0x + 40 hex
  const STATE_VIEW = (process.env.STATE_VIEW ??
    "0xc199f1072a74d4e905aba1a84d9a45e2546b6222") as `0x${string}`;

  // Replace with a real poolKey
  const poolKey: PoolKey = {
    currency0: "0x0000000000000000000000000000000000000000",
    currency1: "0x0000000000000000000000000000000000000000",
    fee: 3000,
    tickSpacing: 60,
    hooks: "0x0000000000000000000000000000000000000000",
  };

  const hint = await computeStateHint64({
    rpcUrl: RPC_URL,
    stateView: STATE_VIEW,
    poolKey,
  });

  const deadline = Math.floor(Date.now() / 1000) + 30;
  const bindTag = BigInt("0x" + crypto.randomUUID().replaceAll("-", "").slice(0, 16));
  const auth = hexToBytes(AUTH_ADDR);

  // Placeholder PM calldata (Brain should generate real ABI calldata)
  const pmCallData = hexToBytes("0x1234");

  const payload = pack(deadline, bindTag, auth, hint, [
    op(OP_CALL, 0, pmCallData),
  ]);

  process.stdout.write(Buffer.from(payload).toString("hex"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});