// contracts/KernelLegacy.yul
// PROD COMPAT — no EIP-1153 (uses storage)
// - No offchain changes required
// - PackedOps format unchanged (64B header + ops stream)
// Storage packing:
//   slot0 = bindTag(64) | auth(160)<<64 | mirr(32)<<224

object "KernelLegacy" {
  code {
    datacopy(0, dataoffset("Runtime"), datasize("Runtime"))
    return(0, datasize("Runtime"))
  }

  object "Runtime" {
    code {
      let PM := __PM__
      let SEL_UNLOCK := 0x48c89491
      let SEL_UCALL  := 0x91dd7346

      // packed state slot
      let SS_PACK := 0

      // masks
      let MASK64  := 0xffffffffffffffff
      let MASK160 := 0xffffffffffffffffffffffffffffffffffffffff
      let MASK224 := 0x00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff // low 224 bits

      function die() { revert(0,0) }
      function m160(x) -> y { y := and(x, MASK160) }

      function packState(bindTag, auth, mirr) -> v {
        // bindTag: u64 in low 64
        // auth: address in next 160
        // mirr: u32 in top 32
        v := or(or(and(bindTag, MASK64), shl(64, m160(auth))), shl(224, and(mirr, 0xffffffff)))
      }

      function getBind(v) -> b { b := and(v, MASK64) }
      function getAuth(v) -> a { a := and(shr(64, v), MASK160) }
      function getMirr(v) -> m { m := shr(224, v) }

      function setMirr(v, newM) -> out {
        // keep low 224 bits (bind+auth), replace high 32 (mirr)
        out := or(and(v, MASK224), shl(224, and(newM, 0xffffffff)))
      }

      function pmcall(payload, len) {
        if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { die() }
      }

      function callUnlock() {
        if lt(calldatasize(), 64) { die() }

        let w0 := calldataload(0)
        let w1 := calldataload(32)

        let deadline := and(w0, MASK64)
        if gt(timestamp(), deadline) { die() }

        let bindTag := and(shr(64, w0), MASK64)

        let auth := m160(w1)
        if iszero(eq(caller(), auth)) { die() }

        // set packed state (mirr=0)
        sstore(SS_PACK, packState(bindTag, auth, 0))

        // ABI encode unlock(bytes)
        let p := mload(0x40)
        mstore(p, shl(224, SEL_UNLOCK))
        mstore(add(p, 4), 0x20)
        let n := calldatasize()
        mstore(add(p, 36), n)
        calldatacopy(add(p, 68), 0, n)
        let total := add(68, n)

        if iszero(call(gas(), PM, 0, p, total, 0, 0)) { die() }
        return(0,0)
      }

      function handleCallback() {
        if iszero(eq(calldataload(4), 0x20)) { die() }
        let dataLen := calldataload(36)
        if lt(dataLen, 64) { die() }
        let dataPtr := 68
        run(dataPtr, add(dataPtr, dataLen))
        return(0,0)
      }

      function run(ptr, end) {
        let w0 := calldataload(ptr)
        let w1 := calldataload(add(ptr, 32))

        let deadline := and(w0, MASK64)
        if gt(timestamp(), deadline) { die() }

        let bindTag := and(shr(64, w0), MASK64)
        let auth := m160(w1)

        let st := sload(SS_PACK)
        if iszero(eq(bindTag, getBind(st))) { die() }
        if iszero(eq(auth, getAuth(st))) { die() }

        let p := add(ptr, 64)

        for { } lt(p, end) { } {
          if gt(add(p, 4), end) { die() }

          let hw := calldataload(p)
          let op := byte(0, hw)
          let len := and(shr(224, hw), 0xffff)
          let next := add(p, add(4, len))
          if gt(next, end) { die() }
          let payload := add(p, 4)

          switch op
          case 0x01 {
            pmcall(payload, len)
          }
          case 0x02 {
            pmcall(payload, len)
            st := sload(SS_PACK)
            let m := add(getMirr(st), 1)
            sstore(SS_PACK, setMirr(st, m))
          }
          case 0x03 {
            pmcall(payload, len)
            st := sload(SS_PACK)
            let m0 := getMirr(st)
            if iszero(m0) { die() }
            sstore(SS_PACK, setMirr(st, sub(m0, 1)))
          }
          case 0x04 {
            pmcall(payload, len)
          }
          default { die() }

          p := next
        }

        // mirror must be zero
        st := sload(SS_PACK)
        if iszero(eq(getMirr(st), 0)) { die() }

        // clear state
        sstore(SS_PACK, 0)
      }

      let sig := shr(224, calldataload(0))
      if eq(sig, SEL_UCALL) { handleCallback() }
      callUnlock()
    }
  }
}