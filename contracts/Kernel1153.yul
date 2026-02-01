object "Kernel1153" {
  code {
    datacopy(0, dataoffset("Runtime"), datasize("Runtime"))
    return(0, datasize("Runtime"))
  }

  object "Runtime" {
    code {
      // ------------------ PATCHED CONSTANTS ------------------
      // Inject at build-time: let PM := 0x....
      let PM := __PM__

      // selectors
      let SEL_UNLOCK := 0x48c89491 // unlock(bytes)
      let SEL_UCALL  := 0x91dd7346 // unlockCallback(bytes)
      let SEL_ERC20_TRANSFER := 0xa9059cbb // transfer(address,uint256)

      // transient slots
      let TS_BIND := 0x20
      let TS_AUTH := 0x21
      let TS_HINT := 0x22
      let TS_MIRR := 0x10

      function fail() { revert(0, 0) }

      // ------------------ ENTRY: unlock(bytes) forward ------------------
      // Accepts PackedOps (header+ops) and forwards as PM.unlock(bytes)
      function callUnlock() {
        // header v2 is 72 bytes now (deadline u64 BE | bindTag u64 BE | auth (low20B) | hint u64 BE)
        if lt(calldatasize(), 72) { fail() }

        let w0 := calldataload(0)
        let w1 := calldataload(32)

        // word0:
        // bytes[0..7]  deadline u64 BE  => deadline = shr(192,w0)
        // bytes[8..15] bindTag  u64 BE  => bindTag  = (w0 >> 128) & u64
        let deadline := shr(192, w0)
        if gt(timestamp(), deadline) { fail() }

        let bindTag := and(shr(128, w0), 0xffffffffffffffff)

        // auth: low 20 bytes of word1
        let auth := and(w1, 0xffffffffffffffffffffffffffffffffffffffff)
        if iszero(eq(caller(), auth)) { fail() }

        // hint: u64 BE at offset 64 => top 8 bytes of calldataload(64)
        let hint := shr(192, calldataload(64))

        // persist across PM.unlock -> PM.unlockCallback -> this runtime
        tstore(TS_BIND, bindTag)
        tstore(TS_AUTH, auth)
        tstore(TS_HINT, hint)
        tstore(TS_MIRR, 0)

        // ABI encode: unlock(bytes data)
        // calldata layout: selector(4) | offset(32) | length(32) | data(n)
        let p := mload(0x40)
        mstore(p, shl(224, SEL_UNLOCK))
        mstore(add(p, 4), 0x20)

        let n := calldatasize()
        mstore(add(p, 36), n)
        calldatacopy(add(p, 68), 0, n)

        let total := add(68, n)
        if iszero(call(gas(), PM, 0, p, total, 0, 0)) { fail() }

        return(0, 0)
      }

      // ------------------ CALLBACK: unlockCallback(bytes data) ------------------
      function handleCallback() {
        // canonical ABI: selector + offset(0x20) + len + data
        if iszero(eq(calldataload(4), 0x20)) { fail() }

        let dataLen := calldataload(36)
        let dataPtr := 68

        // header v2 must exist inside callback data
        if lt(dataLen, 72) { fail() }

        run(dataPtr, add(dataPtr, dataLen))
        return(0, 0)
      }

      // ------------------ RUN: parse PackedOps ------------------
      //
      // PackedOps header v2 (72B):
      //   word0: deadline(u64 BE @ bytes0..7) | bindTag(u64 BE @ bytes8..15)
      //   word1: auth in low 20 bytes
      //   word2: stateHint64(u64 BE @ bytes64..71)
      //
      // ops begin at offset +72 from ptr
      //
      // op header (4B): [op:1][flags:1][len:2 big-endian]
      // payload follows (len bytes)
      //
      // opcodes:
      //  0x01 CALL      : call PM with payload as calldata
      //  0x02 TAKE      : call PM; mirror++
      //  0x03 CLEAR     : call PM; mirror--
      //  0x04 SETTLE    : call PM
      //  0x05 ERC20XFER : payload = [token:20][amount:32]  -> token.transfer(PM, amount)
      //  0x06 CALLV     : payload = [value:32][calldata:len-32] -> call PM with msg.value=value
      function run(ptr, end) {
        let w0 := calldataload(ptr)
        let w1 := calldataload(add(ptr, 32))

        let deadline := shr(192, w0)
        if gt(timestamp(), deadline) { fail() }

        let bindTag := and(shr(128, w0), 0xffffffffffffffff)
        if iszero(eq(bindTag, tload(TS_BIND))) { fail() }

        let auth := and(w1, 0xffffffffffffffffffffffffffffffffffffffff)
        if iszero(eq(auth, tload(TS_AUTH))) { fail() }

        // state hint binding
        let expectedHint := shr(192, calldataload(add(ptr, 64)))
        if iszero(eq(expectedHint, tload(TS_HINT))) { fail() }

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
            if iszero(call(gas(), PM, 0, payload, len, 0, 0)) { fail() }
          }
          case 0x05 {
            // ERC20 transfer(token.transfer(PM, amount))
            // payload layout: token(20) + amount(32) => len must be 52
            if iszero(eq(len, 52)) { fail() }

            let token := shr(96, calldataload(payload)) // first 20 bytes
            let amount := calldataload(add(payload, 20))

            let q := mload(0x40)
            mstore(q, shl(224, SEL_ERC20_TRANSFER))
            mstore(add(q, 4), shl(96, PM))
            mstore(add(q, 36), amount)

            // call token with calldata (4 + 32 + 32 = 68)
            if iszero(call(gas(), token, 0, q, 68, 0, 0)) { fail() }
          }
          case 0x06 {
            // CALLV: payload layout [value:32][pmCalldata:len-32]
            if lt(len, 32) { fail() }
            let value := calldataload(payload)
            let cdPtr := add(payload, 32)
            let cdLen := sub(len, 32)

            if iszero(call(gas(), PM, value, cdPtr, cdLen, 0, 0)) { fail() }
          }
          default { fail() }

          p := next
        }

        // mirror discipline must be zero
        if iszero(eq(tload(TS_MIRR), 0)) { fail() }

        // clear tx-scope
        tstore(TS_BIND, 0)
        tstore(TS_AUTH, 0)
        tstore(TS_HINT, 0)
        tstore(TS_MIRR, 0)
      }

      // ------------------ DISPATCH ------------------
      // If selector == unlockCallback(bytes) handle it, else forward to unlock(bytes)
      let sig := shr(224, calldataload(0))
      if eq(sig, SEL_UCALL) { handleCallback() }
      callUnlock()
    }
  }
}