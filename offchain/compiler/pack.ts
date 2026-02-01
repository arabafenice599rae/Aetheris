import { Buffer } from "buffer";

export function pack(
  deadline: number,
  bindTag: bigint,
  auth: Uint8Array,      // 20 bytes
  stateHint64: bigint,   // 8 bytes (uint64)
  ops: Uint8Array[]
): Uint8Array {
  if (auth.length !== 20) throw new Error("auth must be 20 bytes");
  if (deadline < 0) throw new Error("deadline must be >= 0");
  if (stateHint64 < 0n || stateHint64 > 0xffffffffffffffffn) {
    throw new Error("stateHint64 must fit uint64");
  }

  // Header v2 = 72 bytes
  const header = Buffer.alloc(72);

  // word0: deadline u64 BE at [0..7], bindTag u64 BE at [8..15]
  header.writeBigUInt64BE(BigInt(deadline), 0);
  header.writeBigUInt64BE(bindTag & 0xffffffffffffffffn, 8);

  // word1: auth in low 20 bytes => right-align in 32B word => offset 32+12
  Buffer.from(auth).copy(header, 32 + 12);

  // word2: hint u64 BE at [64..71]
  header.writeBigUInt64BE(stateHint64, 64);

  return Buffer.concat([header, ...ops.map(o => Buffer.from(o))]);
}