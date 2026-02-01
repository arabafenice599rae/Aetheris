export function pack(
  deadline: number,
  bindTag: bigint,
  auth: Uint8Array,          // 20 bytes
  stateHint64: bigint,       // uint64
  ops: Uint8Array[]
): Uint8Array {
  if (auth.length !== 20) throw new Error("auth must be 20 bytes");
  if (deadline < 0) throw new Error("deadline must be >= 0");

  const header = Buffer.alloc(72);

  // word0: deadline(u64 LE @0), bindTag(u64 LE @8)
  header.writeBigUInt64LE(BigInt(deadline), 0);
  header.writeBigUInt64LE(bindTag & 0xffffffffffffffffn, 8);

  // word1 low 20 bytes = auth (right-aligned)
  Buffer.from(auth).copy(header, 32 + 12);

  // word2 low 8 bytes = hint64 LE
  header.writeBigUInt64LE(stateHint64 & 0xffffffffffffffffn, 64);

  return Buffer.concat([header, ...ops.map((o) => Buffer.from(o))]);
}