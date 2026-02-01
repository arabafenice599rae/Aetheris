import crypto from "crypto";
import { pack } from "../compiler/pack";
import { computeStateHint64, PoolKey } from "../compiler/statepack";
import { opCallV, opTake, opClear } from "../compiler/payloads";

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
  const RPC_URL   = mustEnv("RPC_URL");
  const AUTH      = mustEnv("AUTH");
  const PM        = mustEnv("PM");
  const STATE_VIEW = (process.env.STATE_VIEW ??
    "0xc199f1072a74d4e905aba1a84d9a45e2546b6222") as `0x${string}`;

  const poolKey: PoolKey = {
    currency0: mustEnv("C0") as `0x${string}`,
    currency1: mustEnv("C1") as `0x${string}`,
    fee: Number(mustEnv("FEE")),
    tickSpacing: Number(mustEnv("TICKSPACING")),
    hooks: (process.env.HOOKS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
  };

  const hint = await computeStateHint64({ rpcUrl: RPC_URL, stateView: STATE_VIEW, poolKey });

  const deadline = Math.floor(Date.now() / 1000) + 30;
  const bindTag = BigInt("0x" + crypto.randomUUID().replaceAll("-", "").slice(0, 16));
  const auth = hexToBytes(AUTH);

  // ABI-encoded PM calls
  // settle()/settleFor(recipient) calldata goes here
  const SETTLE_CALLDATA = mustEnv("SETTLE_CALLDATA");
  const TAKE_CALLDATA   = mustEnv("TAKE_CALLDATA");
  const CLEAR_CALLDATA  = mustEnv("CLEAR_CALLDATA");

  // value (wei) to send to PM in the CALLV
  const VALUE_WEI = BigInt(mustEnv("VALUE_WEI"));

  const ops = [
    opCallV(VALUE_WEI, SETTLE_CALLDATA),
    opTake(TAKE_CALLDATA),
    opClear(CLEAR_CALLDATA),
  ];

  const payload = pack(deadline, bindTag, auth, hint, ops);
  process.stdout.write("0x" + Buffer.from(payload).toString("hex") + "\n");

  process.stderr.write(
    `PM=${PM}\n` +
    `deadline=${deadline}\n` +
    `bindTag=0x${bindTag.toString(16)}\n` +
    `hint=0x${hint.toString(16)}\n` +
    `valueWei=${VALUE_WEI}\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});