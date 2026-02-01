import { pack } from "../compiler/pack";
import { bytesToHex, hexToBytes } from "../compiler/ops";
import { STR01_PokeFees } from "../strategies/strategies";

const deadline = Math.floor(Date.now()/1000) + 30;
const bindTag  = 0x1122334455667788n;
const auth = hexToBytes("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

const key = {
  currency0: "0x0000000000000000000000000000000000000001",
  currency1: "0x0000000000000000000000000000000000000002",
  fee: 3000,
  tickSpacing: 60,
  hooks: "0x0000000000000000000000000000000000000000",
} as const;

const ops = STR01_PokeFees(key, -600, 600, ("0x"+"00".repeat(32)) as any, "0x");
const payload = pack(deadline, bindTag, auth, ops);

console.log(bytesToHex(payload));