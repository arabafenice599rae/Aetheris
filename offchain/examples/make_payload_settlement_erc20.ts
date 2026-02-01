import crypto from "crypto";
import { pack } from "../compiler/pack";
import { computeStateHint64, PoolKey } from "../compiler/statepack";
import { opCall, opErc20Xfer, opSettle, opTake, opClear } from "../compiler/payloads";

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
  // --- Required env ---
  const RPC_URL   = mustEnv("RPC_URL");
  const AUTH      = mustEnv("AUTH");          // 0x + 40 hex (caller that can submit)
  const PM        = mustEnv("PM");            // informational here
  const STATE_VIEW = (process.env.STATE_VIEW ??
    "0xc199f1072a74d4e905aba1a84d9a45e2546b6222") as `0x${string}`;

  // PoolKey used only to compute hint (you must set real values)
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

  // --- Required calldata env (ABI-encoded PM calls) ---
  // You generate these off-chain with your ABI encoder:
  //  PM.sync(currency)           -> SYNC_CALLDATA
  //  PM.settleFor(recipient)     -> SETTLEFOR_CALLDATA   (or settle() if you want)
  //  PM.take(currency,to,amount) -> TAKE_CALLDATA
  //  PM.clear(currency,amount)   -> CLEAR_CALLDATA
  const SYNC_CALLDATA    = mustEnv("SYNC_CALLDATA");
  const SETTLEFOR_CALLDATA = mustEnv("SETTLEFOR_CALLDATA");
  const TAKE_CALLDATA    = mustEnv("TAKE_CALLDATA");
  const CLEAR_CALLDATA   = mustEnv("CLEAR_CALLDATA");

  // ERC20 funding leg:
  const TOKEN = mustEnv("TOKEN"); // ERC20 token address to transfer to PM
  const AMOUNT = BigInt(mustEnv("AMOUNT")); // uint256 decimal string

  const ops = [
    opCall(SYNC_CALLDATA),
    opErc20Xfer(TOKEN, AMOUNT),
    opSettle(SETTLEFOR_CALLDATA),
    opTake(TAKE_CALLDATA),
    opClear(CLEAR_CALLDATA),
  ];

  const payload = pack(deadline, bindTag, auth, hint, ops);
  process.stdout.write("0x" + Buffer.from(payload).toString("hex") + "\n");

  // Optional debug
  process.stderr.write(
    `PM=${PM}\n` +
    `deadline=${deadline}\n` +
    `bindTag=0x${bindTag.toString(16)}\n` +
    `hint=0x${hint.toString(16)}\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});