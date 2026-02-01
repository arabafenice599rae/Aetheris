export function op(opcode: number, flags: number, payload: Uint8Array): Uint8Array {
  const len = payload.length;
  if (len > 0xffff) throw new Error("payload too large");
  const out = new Uint8Array(4 + len);
  out[0] = opcode & 0xff;
  out[1] = flags & 0xff;
  out[2] = (len >>> 8) & 0xff; // big-endian
  out[3] = len & 0xff;
  out.set(payload, 4);
  return out;
}

export const OP_CALL = 0x01;
export const OP_TAKE = 0x02;
export const OP_CLEAR = 0x03;
export const OP_SETTLE = 0x04;

// PROMAX additions:
export const OP_ERC20XFER = 0x05; // payload: token(20) + amount(32)
export const OP_CALLV = 0x06;     // payload: value(32) + calldata(...)