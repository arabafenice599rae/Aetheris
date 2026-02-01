import fs from "fs";
import { PoolKey } from "../compiler/statepack";

function lsb14(addr: string): number {
  const a = BigInt(addr);
  return Number(a & ((1n << 14n) - 1n));
}

// flags (14-bit)
const F_AFTER_SWAP_RETURNS_DELTA = 1 << 2;
const F_BEFORE_SWAP_RETURNS_DELTA = 1 << 3;
const F_AFTER_ADD_LIQ_RETURNS_DELTA = 1 << 1;
const F_AFTER_REMOVE_LIQ_RETURNS_DELTA = 1 << 0;

type HookClass = "vanilla-safe" | "hook-safe" | "hook-hostile";

function classifyHooks(hooks: `0x${string}`): { cls: HookClass; flags: number; note: string } {
  if (hooks.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    return { cls: "vanilla-safe", flags: 0, note: "no hooks" };
  }

  const flags = lsb14(hooks);
  const returnsDelta =
    (flags & F_AFTER_SWAP_RETURNS_DELTA) ||
    (flags & F_BEFORE_SWAP_RETURNS_DELTA) ||
    (flags & F_AFTER_ADD_LIQ_RETURNS_DELTA) ||
    (flags & F_AFTER_REMOVE_LIQ_RETURNS_DELTA);

  if (returnsDelta) {
    return { cls: "hook-hostile", flags, note: "returnsDelta enabled" };
  }

  return { cls: "hook-safe", flags, note: "hooks enabled, no returnsDelta" };
}

function main() {
  const inFile = process.argv[2] ?? "offchain/risk/pools.json";
  const outFile = process.argv[3] ?? "offchain/risk/hook_policy.json";

  const pools: PoolKey[] = JSON.parse(fs.readFileSync(inFile, "utf8"));

  const table = pools.map((p) => {
    const hooks = p.hooks;
    const r = classifyHooks(hooks);
    return { hooks, cls: r.cls, flags14: r.flags, note: r.note };
  });

  // unique by hooks
  const uniq = new Map<string, any>();
  for (const row of table) uniq.set(row.hooks.toLowerCase(), row);

  const out = Array.from(uniq.values()).sort((a, b) => a.hooks.localeCompare(b.hooks));
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.length} hook policies to ${outFile}`);
}

main();