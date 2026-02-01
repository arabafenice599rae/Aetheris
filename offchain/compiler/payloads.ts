import { op, OP_CALL, OP_CALLV, OP_ERC20XFER, OP_TAKE, OP_CLEAR, OP_SETTLE } from "./ops";

function hexToBytes(h: string): Uint8Array {
  if (h.startsWith("0x")) h = h.slice(2);
  if (h.length % 2 !== 0) throw new Error("hex must be even length");
  return Uint8Array.from(Buffer.from(h, "hex"));
}

function u256ToBytesBE(x: bigint): Uint8Array {
  if (x < 0n) throw new Error("u256 must be >= 0");
  const hex = x.toString(16).padStart(64, "0");
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function addressToBytes20(addr: string): Uint8Array {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error("address must be 0x + 40 hex");
  return hexToBytes(addr);
}

export function opCall(pmCalldataHex: string, flags = 0): Uint8Array {
  return op(OP_CALL, flags, hexToBytes(pmCalldataHex));
}
export function opSettle(pmCalldataHex: string, flags = 0): Uint8Array {
  return op(OP_SETTLE, flags, hexToBytes(pmCalldataHex));
}
export function opTake(pmCalldataHex: string, flags = 0): Uint8Array {
  return op(OP_TAKE, flags, hexToBytes(pmCalldataHex));
}
export function opClear(pmCalldataHex: string, flags = 0): Uint8Array {
  return op(OP_CLEAR, flags, hexToBytes(pmCalldataHex));
}

export function opCallV(valueWei: bigint, pmCalldataHex: string, flags = 0): Uint8Array {
  const cd = hexToBytes(pmCalldataHex);
  const v = u256ToBytesBE(valueWei);
  return op(OP_CALLV, flags, new Uint8Array(Buffer.concat([Buffer.from(v), Buffer.from(cd)])));
}

export function opErc20Xfer(token: `0x${string}`, amount: bigint, flags = 0): Uint8Array {
  const t = addressToBytes20(token);
  const a = u256ToBytesBE(amount);
  return op(OP_ERC20XFER, flags, new Uint8Array(Buffer.concat([Buffer.from(t), Buffer.from(a)])));
}