object "Kernel1153" {
  code {
    datacopy(0, dataoffset("Runtime"), datasize("Runtime"))
    return(0, datasize("Runtime"))
  }

  object "Runtime" {
    code {
      // ---------- CONSTANTS (patch at build) ----------
      let PM := __PM__

      // selectors
      let SEL_UNLOCK := 0x48c89491 // unlock(bytes)
      let SEL_UCALL  := 0x91dd7346 // unlockCallback(bytes)

      // ERC20 selector
      let SEL_ERC20_TRANSFER := 0xa9059cbb // transfer(address,uint256)

      // transient slots (EIP-1153)
      let TS_BIND := 0x20
      let TS_AUTH := 0x21
      let TS_MIRR := 0x10

      function fail() { revert(0,0) }

      // ---------- Forward path ----------
      function callUnlock() {
        if lt(calldatasize(), 64) { fail() }

        let w0 := calldataload(0)
        let w1 := calldataload(32)

        let deadline := and(w0, 0xffffffffffffffff)
        if gt(timestamp(), deadline) { fail() }

        let bindTag := and(shr(64, w0), 0xffffffffffffffff)
        let auth := and(w1, 0xffffffffffffffffffffffffffffffffffffffff)
        if iszero(eq(caller(), auth)) { fail() }

        tstore(TS_BIND, bindTag)
        tstore(TS_AUTH, auth)
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

      // ---------- Callback path ----------
      function handleCallback() {
        if iszero(eq(calldataload(4), 0x20)) { fail() }

        let dataLen := calldataload(36)
        let dataPtr := 68
        if lt(dataLen, 64) { fail() }
        let end := add(dataPtr, dataLen)

        run(dataPtr, end)
        return(0,0)
      }

      // op header: [op:1][flags:1][len:2 big-endian] + payload
      // opcodes:
      // 0x01 CALL     : call PM with payload (value=0)
      // 0x02 TAKE     : call PM with payload; mirror++
      // 0x03 CLEAR    : call PM with payload; mirror--
      // 0x04 SETTLE   : call PM with payload (alias of CALL; kept for compat)
      // 0x05 ERC20XFER: payload = [token:20][amount:32] => token.transfer(PM,amount)
      // 0x06 CALLV    : payload = [value:32][PM calldata...] => call(PM,value,...)

      function run(ptr, end) {
        let w0 := calldataload(ptr)
        let w1 := calldataload(add(ptr, 32))

        let deadline := and(w0, 0xffffffffffffffff)
        if gt(timestamp(), deadline) { fail() }

        let bindTag := and(shr(64, w0), 0xffffffffffffffff)
        if iszero(eq(bindTag, tload(TS_BIND))) { fail() }

        let auth := and(w1, 0xffffffffffffffffffffffffffffffffffffffff)
        if iszero(eq(auth, tload(TS_AUTH))) { fail() }

        let p := add(ptr, 64)

        for { } lt(p, end) { } {
          if gt(add(p, 4), end) { fail() }

          let w := calldataload(p)
          let opcode := byte(0, w)
          let len := and(shr(224, w), 0xffff)

          let next := add(p, add(4, len))
          if gt(next, end) { fail() }

          let payload := add(p, 4)

          switch opcode
          case 0x01 {
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
          }
          case 0x02 {
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
            tstore(TS_MIRR, add(tload(TS_MIRR), 1))
          }
          case 0x03 {
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
            let m := tload(TS_MIRR)
            if iszero(m) { fail() }
            tstore(TS_MIRR, sub(m, 1))
          }
          case 0x04 {
            // SETTLE alias of CALL
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
          }
          case 0x05 {
            // ERC20XFER: [token:20][amount:32] => token.transfer(PM,amount)
            if iszero(eq(len, 52)) { fail() }
            let token := shr(96, calldataload(payload))
            let amt := calldataload(add(payload, 20))

            let mptr := mload(0x40)
            mstore(mptr, shl(224, SEL_ERC20_TRANSFER))
            mstore(add(mptr, 4), shl(96, PM))
            mstore(add(mptr, 36), amt)

            if iszero(call(gas(), token, 0, mptr, 68, 0, 0)) { fail() }
          }
          case 0x06 {
            // CALLV: [value:32][calldata...]
            if lt(len, 32) { fail() }
            let v := calldataload(payload)
            let cd := add(payload, 32)
            let cdlen := sub(len, 32)
            if iszero(call(gas(), PM, v, cd, cdlen, 0, 0)) { fail() }
          }
          default { fail() }

          p := next
        }

        if iszero(eq(tload(TS_MIRR), 0)) { fail() }

        tstore(TS_BIND, 0)
        tstore(TS_AUTH, 0)
        tstore(TS_MIRR, 0)
      }

      // ENTRY
      let sig := shr(224, calldataload(0))
      if eq(sig, SEL_UCALL) { handleCallback() }
      callUnlock()
    }
  }
}