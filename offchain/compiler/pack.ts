export function pack(
  deadline:number,
  bindTag:bigint,
  auth:Uint8Array, // 20 bytes
  ops:Uint8Array[]
): Uint8Array {
  if (auth.length !== 20) throw new Error("auth must be 20 bytes");

  const header = Buffer.alloc(64);
  header.writeBigUInt64LE(BigInt(deadline), 0);
  header.writeBigUInt64LE(bindTag, 8);

  Buffer.from(auth).copy(header, 32 + 12);

  return Buffer.concat([header, ...ops.map(o => Buffer.from(o))]);
}