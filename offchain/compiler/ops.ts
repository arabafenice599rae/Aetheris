export function op(opcode:number, flags:number, payload:Uint8Array): Uint8Array {
  const len = payload.length;
  if (len > 0xffff) throw new Error("payload too large");
  const out = new Uint8Array(4 + len);
  out[0] = opcode & 0xff;
  out[1] = flags & 0xff;
  out[2] = (len >>> 8) & 0xff;   // big-endian
  out[3] = len & 0xff;
  out.set(payload, 4);
  return out;
}

// opcodes (PROMAX)
export const OP_CALL     = 0x01;
export const OP_TAKE     = 0x02;
export const OP_CLEAR    = 0x03;
export const OP_SETTLE   = 0x04; // alias of CALL
export const OP_ERC20XFER= 0x05; // token.transfer(PM,amount)
export const OP_CALLV    = 0x06; // call PM with msg.value

export function hexToBytes(h:string): Uint8Array {
  if (h.startsWith("0x")) h = h.slice(2);
  if (h.length % 2) throw new Error("bad hex");
  return Uint8Array.from(Buffer.from(h, "hex"));
}

export function bytesToHex(b:Uint8Array): string {
  return "0x" + Buffer.from(b).toString("hex");
}

export function cat(...parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((s,p)=>s+p.length, 0);
  const out = new Uint8Array(n);
  let o=0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}