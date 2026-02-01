object "Kernel1153" {
  code {
    datacopy(0, dataoffset("Runtime"), datasize("Runtime"))
    return(0, datasize("Runtime"))
  }

  object "Runtime" {
    code {
      // ---------- CONSTANTS (patch at build) ----------
      let PM := __PM__
      let SEL_UNLOCK := 0x48c89491          // unlock(bytes)
      let SEL_UCALL  := 0x91dd7346          // unlockCallback(bytes)

      // ERC20.transfer selector
      let SEL_ERC20_TRANSFER := 0xa9059cbb

      // transient slots
      let TS_BIND := 0x20
      let TS_AUTH := 0x21
      let TS_HINT := 0x22
      let TS_MIRR := 0x10

      function fail() { revert(0,0) }

      function callUnlock() {
        // Header must be >= 72B: w0(32)+w1(32)+hint(8)
        if lt(calldatasize(), 72) { fail() }

        let w0 := calldataload(0)
        let w1 := calldataload(32)
        let w2 := calldataload(64)

        // word0: deadline(u64 LE low 8B), bindTag(u64 LE next 8B)
        let deadline := and(w0, 0xffffffffffffffff)
        if gt(timestamp(), deadline) { fail() }
        let bindTag := and(shr(64, w0), 0xffffffffffffffff)

        // word1 low 20B = auth
        let auth := and(w1, 0xffffffffffffffffffffffffffffffffffffffff)
        if iszero(eq(caller(), auth)) { fail() }

        // store tx-scope binding
        tstore(TS_BIND, bindTag)
        tstore(TS_AUTH, auth)
        tstore(TS_HINT, w2)
        tstore(TS_MIRR, 0)

        // ABI encode unlock(bytes)
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
        // require canonical bytes encoding: offset == 0x20
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
        if iszero(eq(bindTag, tload(TS_BIND))) { fail() }

        let auth := and(w1, 0xffffffffffffffffffffffffffffffffffffffff)
        if iszero(eq(auth, tload(TS_AUTH))) { fail() }

        // hint must match exactly
        if iszero(eq(w2, tload(TS_HINT))) { fail() }

        let p := add(ptr, 72)

        for { } lt(p, end) { } {
          // op header = 4 bytes, must exist
          if gt(add(p, 4), end) { fail() }

          let w := calldataload(p)
          let op := byte(0, w)
          let len := and(shr(224, w), 0xffff) // bytes[2..3] big-endian

          let next := add(p, add(4, len))
          if gt(next, end) { fail() }

          let payload := add(p, 4)

          switch op
          case 0x01 {
            // CALL PM
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
          }
          case 0x02 {
            // TAKE (mirror++)
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
            tstore(TS_MIRR, add(tload(TS_MIRR), 1))
          }
          case 0x03 {
            // CLEAR (mirror--)
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
            let m := tload(TS_MIRR)
            if iszero(m) { fail() }
            tstore(TS_MIRR, sub(m, 1))
          }
          case 0x04 {
            // SETTLE
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
          }

          /*IF_CALLV*/
          case 0x05 {
            // CALLV: payload = value(32) || calldata
            if lt(len, 32) { fail() }
            let v := calldataload(payload)
            let cdPtr := add(payload, 32)
            let cdLen := sub(len, 32)
            if iszero(call(gas(), PM, v, cdPtr, cdLen, 0, 0)) { fail() }
          }
          /*ENDIF_CALLV*/

          /*IF_ERC20XFER*/
          case 0x06 {
            // ERC20XFER: payload = token(20) || amount(32) ; len == 52
            if iszero(eq(len, 52)) { fail() }

            let tokenWord := calldataload(payload)
            let token := and(tokenWord, 0xffffffffffffffffffffffffffffffffffffffff)
            let amt := calldataload(add(payload, 20))

            // transfer(PM, amt)
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

        // must close mirror to zero
        if iszero(eq(tload(TS_MIRR), 0)) { fail() }

        // clear tx-scope state
        tstore(TS_BIND, 0)
        tstore(TS_AUTH, 0)
        tstore(TS_HINT, 0)
        tstore(TS_MIRR, 0)
      }

      // --------- ENTRY DISPATCH ----------
      let sig := shr(224, calldataload(0))
      if eq(sig, SEL_UCALL) { handleCallback() }
      callUnlock()
    }
  }
}