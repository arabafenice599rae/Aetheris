import { pack } from "../compiler/pack";
import { bytesToHex, hexToBytes } from "../compiler/ops";
import { STR08_SettleNativeIn } from "../strategies/strategies";

const deadline = Math.floor(Date.now()/1000) + 30;
const bindTag  = 0x0102030405060708n;
const auth = hexToBytes("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

const valueWei = 10_000_000_000_000_000n; // 0.01 ETH
const recipient= "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

const ops = STR08_SettleNativeIn(valueWei, recipient);
const payload = pack(deadline, bindTag, auth, ops);

console.log(bytesToHex(payload));