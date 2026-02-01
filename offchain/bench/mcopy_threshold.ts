// offchain/bench/mcopy_threshold.ts
import fs from "fs";

function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const i = Math.floor(xs.length * p);
  return xs[Math.min(i, xs.length - 1)];
}

function main() {
  const file = process.argv[2] ?? "offchain/bench/payloads.txt";
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);

  const sizes = lines.map((l) => {
    const s = l.startsWith("0x") ? l.slice(2) : l;
    return Math.floor(s.length / 2);
  }).sort((a, b) => a - b);

  const p50 = percentile(sizes, 0.50);
  const p90 = percentile(sizes, 0.90);
  const p99 = percentile(sizes, 0.99);

  const recommend = (p50 >= 512 || p99 >= 2048)
    ? "Macro-runner likely: consider MCOPY in specialized kernel build"
    : "Keep base kernel lean: MCOPY not worth it";

  console.log(JSON.stringify({ n: sizes.length, p50, p90, p99, min: sizes[0], max: sizes[sizes.length-1], recommend }, null, 2));
}

main();