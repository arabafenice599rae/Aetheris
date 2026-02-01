import fs from "fs";
import { execSync } from "child_process";

const N = Number(process.env.N ?? "50");
const OUT = process.env.OUT ?? "offchain/bench/payloads.txt";

function main() {
  const lines: string[] = [];
  for (let i = 0; i < N; i++) {
    const out = execSync("node offchain/examples/make_payload_mpn.ts", { stdio: ["ignore", "pipe", "inherit"] }).toString().trim();
    lines.push(out);
  }
  fs.writeFileSync(OUT, lines.join("\n") + "\n");
  console.log(`Wrote ${N} payloads -> ${OUT}`);
}
main();