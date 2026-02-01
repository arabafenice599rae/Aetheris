import { op, OP_CALL, OP_CALLV, OP_ERC20XFER, OP_TAKE, OP_CLEAR, OP_SETTLE } from "./ops";

function hexToBytes(h: string): Uint8Array {
  if (h.startsWith("0x")) h = h.slice(2);
  if (h.length % 2 !== 0) throw new Error("hex string must have even length");
  return Uint8Array.from(Buffer.from(h, "hex"));
}

function u256ToBytesBE(x: bigint): Uint8Array {
  if (x < 0n) throw new Error("u256 must be >= 0");
  const out = Buffer.alloc(32);
  const hex = x.toString(16).padStart(64, "0");
  Buffer.from(hex, "hex").copy(out);
  return new Uint8Array(out);
}

function addressToBytes20(addr: string): Uint8Array {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error("address must be 0x + 40 hex");
  return hexToBytes(addr);
}

// Generic PM call (already ABI-encoded)
export function opCall(pmCalldataHex: string, flags = 0): Uint8Array {
  return op(OP_CALL, flags, hexToBytes(pmCalldataHex));
}

// PM call with msg.value (CALLV payload = value(32) || calldata)
export function opCallV(valueWei: bigint, pmCalldataHex: string, flags = 0): Uint8Array {
  const cd = hexToBytes(pmCalldataHex);
  const v = u256ToBytesBE(valueWei);
  const payload = Buffer.concat([Buffer.from(v), Buffer.from(cd)]);
  return op(OP_CALLV, flags, new Uint8Array(payload));
}

// ERC20 transfer(token -> PM, amount)
// payload = token(20) || amount(32)
export function opErc20Xfer(tokenAddr: string, amount: bigint, flags = 0): Uint8Array {
  const token = addressToBytes20(tokenAddr);
  const amt = u256ToBytesBE(amount);
  const payload = Buffer.concat([Buffer.from(token), Buffer.from(amt)]);
  return op(OP_ERC20XFER, flags, new Uint8Array(payload));
}

// These are semantic labels only (still OP_CALL underneath in kernel for PM calls),
// but nice for code readability:
export function opTake(pmTakeCalldataHex: string, flags = 0): Uint8Array {
  return op(OP_TAKE, flags, hexToBytes(pmTakeCalldataHex));
}
export function opClear(pmClearCalldataHex: string, flags = 0): Uint8Array {
  return op(OP_CLEAR, flags, hexToBytes(pmClearCalldataHex));
}
export function opSettle(pmSettleCalldataHex: string, flags = 0): Uint8Array {
  return op(OP_SETTLE, flags, hexToBytes(pmSettleCalldataHex));
}