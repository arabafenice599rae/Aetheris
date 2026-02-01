import { pack } from "../compiler/pack";
import { bytesToHex, hexToBytes } from "../compiler/ops";
import { STR07_SettleERC20In } from "../strategies/strategies";

const deadline = Math.floor(Date.now()/1000) + 30;
const bindTag  = 0x99aabbccddeeff00n;
const auth = hexToBytes("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

// currency is Currency (address) used by PM; token is ERC20 contract
const currency = "0x0000000000000000000000000000000000000001" as const;
const token    = "0x0000000000000000000000000000000000000002" as const;

const amountIn = 1000000n;
const recipient= "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

const ops = STR07_SettleERC20In(currency, token, amountIn, recipient);
const payload = pack(deadline, bindTag, auth, ops);

console.log(bytesToHex(payload));