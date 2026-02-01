// contracts/Kernel1153.yul
// PROD FAST — EIP-1153 (transient storage)
// - No offchain changes required
// - PackedOps format unchanged:
//   header 64B:
//     word0: deadline (u64 LE in low 8B), bindTag (u64 in next 8B)
//     word1: auth address in low 20B
//   ops stream starts at +64
//   op header: [op:1][flags:1][len:2 big-endian], payload follows
// opcodes:
//   0x01 CALL
//   0x02 TAKE  (mirror++)
//   0x03 CLEAR (mirror--)
//   0x04 SETTLE

object "Kernel1153" {
  code {
    datacopy(0, dataoffset("Runtime"), datasize("Runtime"))
    return(0, datasize("Runtime"))
  }

  object "Runtime" {
    code {
      // ---------- CONSTANTS (patch at build) ----------
      let PM := __PM__                             // 20B injected off-chain

      // selectors
      let SEL_UNLOCK := 0x48c89491                 // unlock(bytes)
      let SEL_UCALL  := 0x91dd7346                 // unlockCallback(bytes)

      // transient slots
      let TS_BIND := 0x20
      let TS_AUTH := 0x21
      let TS_MIRR := 0x10

      // masks
      let MASK64  := 0xffffffffffffffff
      let MASK160 := 0xffffffffffffffffffffffffffffffffffffffff

      function die() { revert(0,0) }

      function m160(x) -> y { y := and(x, MASK160) }

      // Single helper for calling PoolManager
      function pmcall(payload, len) {
        if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { die() }
      }

      // Build calldata for PM.unlock(bytes payload=rawCalldata)
      function callUnlock() {
        // payload must contain PackedOps header (>= 64B)
        if lt(calldatasize(), 64) { die() }

        // PackedOps header lives in raw calldata
        let w0 := calldataload(0)
        let w1 := calldataload(32)

        // word0: deadline (u64 LE in low 8B), bindTag in next 8B
        let deadline := and(w0, MASK64)
        if gt(timestamp(), deadline) { die() }

        let bindTag := and(shr(64, w0), MASK64)

        // word1 low 20B = auth (right-aligned by packer)
        let auth := m160(w1)
        if iszero(eq(caller(), auth)) { die() }

        // persist across PM.unlock -> callback
        tstore(TS_BIND, bindTag)
        tstore(TS_AUTH, auth)
        tstore(TS_MIRR, 0)

        // ABI encode unlock(bytes)
        // [selector(4)][offset(32)][len(32)][data...]
        let p := mload(0x40)
        mstore(p, shl(224, SEL_UNLOCK))            // selector
        mstore(add(p, 4), 0x20)                    // offset
        let n := calldatasize()
        mstore(add(p, 36), n)                      // length
        calldatacopy(add(p, 68), 0, n)             // payload
        let total := add(68, n)

        // call PM
        if iszero(call(gas(), PM, 0, p, total, 0, 0)) { die() }
        return(0,0)
      }

      // Handle unlockCallback(bytes data)
      function handleCallback() {
        // require canonical encoding: offset == 0x20
        if iszero(eq(calldataload(4), 0x20)) { die() }

        let dataLen := calldataload(36)
        if lt(dataLen, 64) { die() }               // header must exist

        let dataPtr := 68
        run(dataPtr, add(dataPtr, dataLen))
        return(0,0)
      }

      function run(ptr, end) {
        // Validate header against stored bind/auth
        let w0 := calldataload(ptr)
        let w1 := calldataload(add(ptr, 32))

        let deadline := and(w0, MASK64)
        if gt(timestamp(), deadline) { die() }

        let bindTag := and(shr(64, w0), MASK64)
        if iszero(eq(bindTag, tload(TS_BIND))) { die() }

        let auth := m160(w1)
        if iszero(eq(auth, tload(TS_AUTH))) { die() }

        // ops start after 64B header
        let p := add(ptr, 64)

        for { } lt(p, end) { } {
          // need at least 4 bytes header
          if gt(add(p, 4), end) { die() }

          let w := calldataload(p)
          let op := byte(0, w)
          // len is bytes[2..3] big-endian
          let len := and(shr(224, w), 0xffff)

          let next := add(p, add(4, len))
          if gt(next, end) { die() }

          let payload := add(p, 4)

          switch op
          case 0x01 {
            pmcall(payload, len)
          }
          case 0x02 {
            pmcall(payload, len)
            tstore(TS_MIRR, add(tload(TS_MIRR), 1))
          }
          case 0x03 {
            pmcall(payload, len)
            let m := tload(TS_MIRR)
            if iszero(m) { die() }
            tstore(TS_MIRR, sub(m, 1))
          }
          case 0x04 {
            pmcall(payload, len)
          }
          default { die() }

          p := next
        }

        // Mirror must be zero (deterministic discipline)
        if iszero(eq(tload(TS_MIRR), 0)) { die() }

        // Clear tx-scope state (hygiene)
        tstore(TS_BIND, 0)
        tstore(TS_AUTH, 0)
        tstore(TS_MIRR, 0)
      }

      // --------- ENTRY DISPATCH (single runtime) ----------
      // If calldata is unlockCallback(bytes), handle it; else treat as PackedOps and forward into PM.unlock(bytes).
      let sig := shr(224, calldataload(0))
      if eq(sig, SEL_UCALL) { handleCallback() }
      callUnlock()
    }
  }
}