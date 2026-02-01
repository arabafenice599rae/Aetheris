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
      let SEL_ERC20_TRANSFER := 0xa9059cbb

      // storage slots (cross-tx, slower, universal)
      let SS_BIND := 0
      let SS_AUTH := 1
      let SS_HINT := 2
      let SS_MIRR := 3

      function fail() { revert(0,0) }
      function sget(slot) -> v { v := sload(slot) }
      function sset(slot, v) { sstore(slot, v) }

      function callUnlock() {
        if lt(calldatasize(), 72) { fail() }

        let w0 := calldataload(0)
        let w1 := calldataload(32)
        let w2 := calldataload(64)

        let deadline := and(w0, 0xffffffffffffffff)
        if gt(timestamp(), deadline) { fail() }
        let bindTag := and(shr(64, w0), 0xffffffffffffffff)

        let auth := and(w1, 0xffffffffffffffffffffffffffffffffffffffff)
        if iszero(eq(caller(), auth)) { fail() }

        sset(SS_BIND, bindTag)
        sset(SS_AUTH, auth)
        sset(SS_HINT, w2)
        sset(SS_MIRR, 0)

        let p := mload(0x40)
        mstore(p, shl(224, SEL_UNLOCK))
        mstore(add(p, 4), 0x20)
        let n := calldatasize()
        mstore(add(p, 36), n)
        calldatacopy(add(p, 68), 0, n)
        let total := add(68, n)

        if iszero(call(gas(), PM, 0, p, total, 0, 0)) { fail() }
        return(0,0)
      }

      function handleCallback() {
        if iszero(eq(calldataload(4), 0x20)) { fail() }
        let dataLen := calldataload(36)
        let dataPtr := 68
        if lt(dataLen, 72) { fail() }
        run(dataPtr, add(dataPtr, dataLen))
        return(0,0)
      }

      function run(ptr, end) {
        let w0 := calldataload(ptr)
        let w1 := calldataload(add(ptr, 32))
        let w2 := calldataload(add(ptr, 64))

        let deadline := and(w0, 0xffffffffffffffff)
        if gt(timestamp(), deadline) { fail() }

        let bindTag := and(shr(64, w0), 0xffffffffffffffff)
        if iszero(eq(bindTag, sget(SS_BIND))) { fail() }

        let auth := and(w1, 0xffffffffffffffffffffffffffffffffffffffff)
        if iszero(eq(auth, sget(SS_AUTH))) { fail() }

        if iszero(eq(w2, sget(SS_HINT))) { fail() }

        let p := add(ptr, 72)

        for { } lt(p, end) { } {
          if gt(add(p, 4), end) { fail() }
          let w := calldataload(p)
          let op := byte(0, w)
          let len := and(shr(224, w), 0xffff)
          let next := add(p, add(4, len))
          if gt(next, end) { fail() }
          let payload := add(p, 4)

          switch op
          case 0x01 { if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() } }
          case 0x02 {
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
            sset(SS_MIRR, add(sget(SS_MIRR), 1))
          }
          case 0x03 {
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
            let m := sget(SS_MIRR)
            if iszero(m) { fail() }
            sset(SS_MIRR, sub(m, 1))
          }
          case 0x04 { if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() } }

          /*IF_CALLV*/
          case 0x05 {
            if lt(len, 32) { fail() }
            let v := calldataload(payload)
            let cdPtr := add(payload, 32)
            let cdLen := sub(len, 32)
            if iszero(call(gas(), PM, v, cdPtr, cdLen, 0, 0)) { fail() }
          }
          /*ENDIF_CALLV*/

          /*IF_ERC20XFER*/
          case 0x06 {
            if iszero(eq(len, 52)) { fail() }
            let tokenWord := calldataload(payload)
            let token := and(tokenWord, 0xffffffffffffffffffffffffffffffffffffffff)
            let amt := calldataload(add(payload, 20))

            let m := mload(0x40)
            mstore(m, shl(224, SEL_ERC20_TRANSFER))
            mstore(add(m, 4), shl(96, PM))
            mstore(add(m, 36), amt)
            if iszero(call(gas(), token, 0, m, 68, 0, 0)) { fail() }
          }
          /*ENDIF_ERC20XFER*/

          default { fail() }

          p := next
        }

        if iszero(eq(sget(SS_MIRR), 0)) { fail() }

        sset(SS_BIND, 0)
        sset(SS_AUTH, 0)
        sset(SS_HINT, 0)
        sset(SS_MIRR, 0)
      }

      let sig := shr(224, calldataload(0))
      if eq(sig, SEL_UCALL) { handleCallback() }
      callUnlock()
    }
  }
}