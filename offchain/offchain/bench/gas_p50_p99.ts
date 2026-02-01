import { createPublicClient, http } from "viem";

function mustEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
}

async function main() {
  const RPC_URL = mustEnv("RPC_URL");
  const FROM = mustEnv("FROM") as `0x${string}`;
  const TO = mustEnv("TO") as `0x${string}`;           // Kernel address
  const DATA_FILE = mustEnv("DATA_FILE");              // newline-separated 0x... payloads

  const fs = await import("fs");
  const payloads = fs.readFileSync(DATA_FILE, "utf8").trim().split("\n").filter(Boolean);

  const client = createPublicClient({ transport: http(RPC_URL) });

  const gasList: bigint[] = [];
  for (const data of payloads) {
    const g = await client.estimateGas({ account: FROM, to: TO, data: data as `0x${string}` });
    gasList.push(g);
  }

  gasList.sort((a, b) => (a < b ? -1 : 1));
  const p50 = gasList[Math.floor(gasList.length * 0.50)];
  const p99 = gasList[Math.floor(gasList.length * 0.99)];

  console.log(JSON.stringify({
    n: gasList.length,
    p50: p50.toString(),
    p99: p99.toString(),
    min: gasList[0].toString(),
    max: gasList[gasList.length - 1].toString(),
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });