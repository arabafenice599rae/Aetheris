# Aetheris Spec Book (Roadmap 1–6) — V1

> **Aetheris** is an EVM-compatible L1 designed as a **compact DeFi processor**:  
> - **0x7E BitPackedTx** for high-throughput atomic batches  
> - **PC-friendly nodes** via aggressive pruning + snapshot sync  
> - **Enshrined MEV protection** via a private **Lane C** (commit → threshold reveal)  
> - **Hard invariants** (balance safety, delta settlement, deterministic ordering, supply/fee accounting)

---

## Table of Contents

- [Scope](#scope)
- [Design Goals](#design-goals)
- [Key Concepts](#key-concepts)
- [Roadmap 1 — Consensus-Critical Containers](#roadmap-1--consensus-critical-containers)
- [Roadmap 2 — P2P Messages](#roadmap-2--p2p-messages)
- [Roadmap 3 — Txpool & Precheck Pipeline](#roadmap-3--txpool--precheck-pipeline)
- [Roadmap 4 — Executor PoC](#roadmap-4--executor-poc)
- [Roadmap 5 — Pruned Node + Snapshot Sync + Tokenomics](#roadmap-5--pruned-node--snapshot-sync--tokenomics)
- [Roadmap 6 — MEV Lane (Lane C)](#roadmap-6--mev-lane-lane-c)
- [Protocol Invariants (Hard Rules)](#protocol-invariants-hard-rules)
- [Constants (V1 Defaults)](#constants-v1-defaults)
- [Definition of Done (Roadmap 1–6)](#definition-of-done-roadmap-1--6)

---

## Scope

This Spec Book consolidates Roadmaps **1–6** into a single, implementable V1 reference:
- **Consensus data structures**: BlockHeader/Body, checkpoint attestations, snapshot anchors
- **P2P wire protocol**: gossip + request/response
- **Txpool**: caps, metering, zero-copy decoding (where possible)
- **Execution**: EVM + **0x7E executor** (atomic ops + delta settlement)
- **State**: pruning policy + snapshot sync (PC-mode)
- **MEV lane**: **encrypted ordering** with deterministic inclusion and threshold reveal

---

## Design Goals

**MUST**
- Deterministic execution: same inputs → same state root/receipts
- PC-friendly operation: consumer SSD/CPU should validate and stay in sync
- Minimal complexity: no “optional complexity” inside consensus
- MEV protection: encrypted mempool lane, deterministic ordering
- Atomic DeFi batches: compact ops + strict invariants

**SHOULD**
- Easy tooling: standard EVM RPC + extra helpers for 0x7E/Lane C
- Extensible typed envelopes: add new tx types without breaking legacy

---

## Key Concepts

### Typed Transaction Envelope
- Base: **EIP-2718 style** typed transactions
- Supported:
  - `0x02` (standard EVM typed tx)
  - `0x7E` (**BitPackedTx**, compact batch tx)
  - Lane C encrypted wrapper entries (not a tx type, a block lane container)

### 0x7E BitPackedTx (Compact Batch)
- Addr table + token refs + varints + compact ops list
- Strict guards:
  - **allowed_addr_set**
  - budgets (ops/calls/returndata/depth)
  - transient scoped approvals
- **Post-exec delta settlement** for safety and slippage enforcement

### Lane C (Encrypted MEV Lane)
- Encrypted tx entries in gossip
- Proposer commits ordered set → validators publish threshold shares bound to `laneC_root`
- Network cannot read tx content until ordering is fixed

---

# Roadmap 1 — Consensus-Critical Containers

## 1.1 BlockHeaderV1 (high-level)
**MUST include**
- `chain_id`
- `block_number`
- `slot`
- `parent_hash`
- `state_root`
- `receipts_root`
- `baseFeePerGas` (EIP-1559 style)
- `latest_snapshot_anchor_hash` (carry-forward snapshot anchor)
- proposer signature (consensus-critical)

## 1.2 Checkpoint Attestation (finality primitive)
- A compact attestation structure for checkpoint finality
- Used as the safety boundary for pruning and snapshot anchoring

## 1.3 Snapshot Manifest Anchoring
- Each finalized period anchors a snapshot identifier/hash
- Nodes can fast-sync by verifying snapshot artifacts against anchored roots

---

# Roadmap 2 — P2P Messages

## 2.1 Transport
- libp2p + gossipsub
- QUIC preferred (TCP fallback acceptable)

## 2.2 Gossip Topics
- `aetheris/v1/tx/public`  
  - typed tx bytes (0x02, 0x7E)
- `aetheris/v1/laneC/encrypted`  
  - `EncryptedTxEntryV1`
- `aetheris/v1/laneC/shares/{slot}` (ephemeral)  
  - `DecryptionShareBundleV1`
- `aetheris/v1/block/announce`  
  - header-first announce

## 2.3 Request/Response Protocol IDs
- Blocks:
  - `/aetheris/block/header/1`
  - `/aetheris/block/body/1`
- Snapshots:
  - `/aetheris/snapshot/manifest/1`
  - `/aetheris/snapshot/aux/1`
  - `/aetheris/snapshot/chunk/1`
- Optional:
  - `/aetheris/tx/get/1`

## 2.4 MUST Rules (network)
- header-first propagation for large objects
- strict caps (bytes/msg, msg/s, peer rate limiting)
- mandatory dedupe LRU caches

---

# Roadmap 3 — Txpool & Precheck Pipeline

## 3.1 Pools
- `PublicTxPool`: 0x02 + plaintext 0x7E
- `LaneCEncryptedPool`: encrypted entries indexed by commitment
- `LaneCSharesPool`: slot-scoped, TTL 2–3 slots

## 3.2 Precheck (fail-fast)
- parsing + bounds checks
- chain_id/slot sanity
- size caps
- signature sanity (cheap checks)
- fee sanity (baseFee compatibility)

## 3.3 Zero-copy decode (goal)
- Avoid copying large blobs during parsing
- Keep references to raw bytes whenever possible in Rust

---

# Roadmap 4 — Executor PoC

## 4.1 Purpose
Implement the **0x7E execution engine**:
- compact ops decoding
- strict guards
- atomic execution
- delta settlement
- deterministic receipts

## 4.2 Hard Invariants integrated here
- **No Unauthorized Debit**: no spending from accounts other than `sender`
- **Delta Invariant**: post-exec token deltas must satisfy user constraints
- **Atomicity**: all-or-nothing batch
- **Determinism**: same inputs → same state root/receipts

## 4.3 ScopedApprovals (0x7E)
- Transient approvals only (valid within tx execution)
- Spender is implicitly the **Executor** (EVM `transferFrom` semantics)

## 4.4 PoC OpTags (V1)
- `0x10` NATIVE_TRANSFER
- `0x11` ERC20_TRANSFER
- `0x12` ERC20_TRANSFER_FROM (from=sender implicit, requires scoped approval)
- `0x20` CALL_CONTRACT (strict-mode)
- `0x30` SWAP_V2_ADAPTER (PoC AMM adapter)

## 4.5 Strict Access Mode (MUST)
- Build `allowed_addr_set`
- Every external call target must be in the set
- No `DELEGATECALL` (PoC)
- Returndata cap enforced

## 4.6 PoC AMM: V2MiniPool (Mode A)
- Pool does **not** pull funds via `transferFrom`
- Executor pre-funds pool with `tokenIn`
- Pool verifies `actualIn = balanceIn - reserveIn`
- Executes constant-product swap and sync reserves

## 4.7 Receipts
- Standard EVM receipts
- Optional `ops_digest = keccak(ops_blob)` for debugging

---

# Roadmap 5 — Pruned Node + Snapshot Sync + Tokenomics

## 5.1 Node Modes
- `PC_PRUNED` (default): current state + recent window
- `FULL`: extended history
- `ARCHIVE`: all history (out of scope for PC mode)

## 5.2 Snapshot Artifacts (V1)
- `SnapshotManifestV1`: identifies snapshot + expected `state_root`, chunk root, aux hash
- `SnapshotAuxV1`: encoding metadata (minimal)
- `SnapshotChunkV1`: compressed KV records (deterministic order)

**Snapshot Correctness Invariant (MUST)**  
`manifest + aux + chunks` → `computed_state_root == anchored_state_root`

## 5.3 Snapshot Sync (MUST)
1. Sync headers to a finalized anchor `H`
2. Fetch manifest using `latest_snapshot_anchor_hash`
3. Download chunks, verify each hash
4. Ingest into flat KV state
5. Compute state root and match manifest
6. Catch up from `H+1`

## 5.4 Pruning Policy (PC Mode)
- Keep headers longer (e.g. ~90 days)
- Keep bodies/receipts shorter (e.g. 7–14 days)
- Keep state: current + reorg safety buffer
- Never prune beyond finalized checkpoint boundary

**Pruning Safety Invariant (MUST)**  
Pruning must not break validation of new blocks (state + headers + finality sufficient).

## 5.5 Tokenomics (Hard Decisions)
### BaseFee Burn (EIP-1559)
- baseFee is burned each block: `burn_basefee = baseFeePerGas * gasUsedBlock`

### Lane C MEV-burn
- Burn a fixed fraction of tips from Lane C:  
  `burn_mev = tip_laneC * LANEC_MEV_BURN_BPS / 10_000`

### Emission schedule (deterministic)
- `MAX_SUPPLY = 1_000_000_000 AET`
- `GENESIS_SUPPLY = 200_000_000 AET`
- `ERA_LEN_BLOCKS = 33_554_432`
- `REWARD0 = 4 AET / block`
- `reward(block) = REWARD0 >> era`

### Reward split
- proposer: 60%
- attesters: 40% (pro-rata stake)

### TOTAL_SUPPLY (consensus-critical system state)
- Updated each block:
  - `+ block_reward`
  - `- burn_basefee`
  - `- burn_mev`
- MUST: `TOTAL_SUPPLY <= MAX_SUPPLY`

---

# Roadmap 6 — MEV Lane (Lane C)

## 6.1 Goal
Provide an **enshrined private lane** that prevents frontrun/sandwich based on mempool visibility:
- ciphertext gossip (commit)
- deterministic ordering (fairness)
- threshold reveal (decrypt) bound to block commitment

## 6.2 EncryptedTxEntryV1
- Contains: `fee_tag`, `commitment`, `ciphertext_hash`, `ciphertext`, `expiry_slot`, `enc_suite_id`

### Commitment
`commitment = keccak( DOMAIN || chain_id || expiry_slot || ciphertext_hash || salt32 )`

## 6.3 Deterministic Ordering Invariant (MUST)
Sort Lane C entries by:
1. `fee_tag` descending
2. `commitment` ascending
3. `ciphertext_hash` ascending (tie-break)

Block is invalid if ordering differs.

## 6.4 laneC_root and binding
- `entry_hash = keccak( DOMAIN_ENTRY_HASH || header_fields || ciphertext_hash )`
- `laneC_root = MerkleBinaryRoot(entry_hashes in canonical order)`
- Shares must be signed **including `laneC_root`** to prevent replay.

## 6.5 Suite 0 (enc_suite_id=0): Implementable Crypto
- Curve: BLS12-381
- Threshold KEM with epoch key shares
- AEAD: ChaCha20-Poly1305
- HKDF-SHA256 for key derivation
- AAD binds: `chain_id || slot || laneC_root || entry_hash`

### Ciphertext layout V1
`ciphertext = kem_ct(48) || nonce(12) || aead_ct`

### Share format
A validator share for entry `j` is:
- `D_i = U^{s_{E,i}}` (G1 point, 48B compressed)

### shares_payload (bundle)
- list of `(entry_index, dec_share_g1[48])` (count <= 256)

### Share verification (MUST)
Pairing check:
`e(D_i, g2) == e(U, PK_{E,i})`

## 6.6 PC-Friendly Committee (K=64)
To avoid every validator sharing for every entry:
- Deterministic committee per entry:
  - `seed = keccak(DOMAIN_COMMITTEE || chain_id || slot || commitment)`
  - select `K = 64` distinct validators
- Only committee validators’ shares are accepted for that entry
- Threshold is stake-based over the committee:
  - `T = ceil(2/3 * S_committee)`

## 6.7 Liveness Fallback (MUST)
If proposer cannot gather enough valid shares in time:
- publish block with empty Lane C:
  - `laneC_entries = []`
  - `laneC_root = ZERO_HASH`
  - `laneC_shares_root = ZERO_HASH`

Chain must never stall because of Lane C.

## 6.8 Execution
- Decrypt each entry (if included and threshold satisfied)
- Obtain plaintext typed tx bytes (typically 0x7E)
- Execute in the canonical Lane C order

---

# Protocol Invariants (Hard Rules)

1. **Deterministic Lane C ordering**: (fee_tag, commitment, ciphertext_hash)
2. **Share binding**: share bundles must sign over `laneC_root`
3. **No Unauthorized Debit (0x7E)**: cannot spend from non-sender
4. **Delta settlement (0x7E)**: post-exec token deltas must meet constraints
5. **Snapshot correctness**: snapshot artifacts reconstruct anchored `state_root`
6. **Pruning safety**: pruned node must validate new blocks
7. **Supply invariant**: supply changes only by reward schedule and burns
8. **Fee accounting invariant**: baseFee burn + (Lane C tip burn) + proposer tips are exact

---

# Constants (V1 Defaults)

## Networking
- `MAX_GOSSIP_MSG_BYTES = 64KB`
- `MAX_GOSSIP_TX_BYTES = 32KB`
- `MAX_0x7E_PAYLOAD_BYTES = 8KB`
- `MAX_LANEC_CIPHERTEXT_BYTES = 16KB`
- `MAX_EXPIRY_WINDOW = 4 slots`

## Lane C
- `MAX_LANEC_ENTRIES_PER_BLOCK = 2000`
- `MAX_SHARES_PER_BUNDLE = 256`
- `K_COMMITTEE = 64`
- `LANEC_MEV_BURN_BPS = 5000` (50%)

## Tokenomics
- `MAX_SUPPLY = 1_000_000_000 AET`
- `GENESIS_SUPPLY = 200_000_000 AET`
- `REWARD0 = 4 AET/block`
- `ERA_LEN_BLOCKS = 33_554_432`
- `reward(block) = REWARD0 >> era`

---

# Definition of Done (Roadmap 1–6)

You are “done” when you can run a multi-node devnet that:
1. Produces blocks at 2s slots
2. Accepts and executes 0x02 and 0x7E txs deterministically
3. Executes the 0x7E executor PoC (transfer/call/swap + delta settlement)
4. Runs Lane C end-to-end: encrypted entry gossip → deterministic ordering → shares → decrypt → execute
5. Enforces fee/supply invariants: baseFee burn + Lane C tip burn + reward schedule + TOTAL_SUPPLY
6. Supports PC mode: snapshot sync and pruning without breaking validation
7. Passes the invariant test suite (ordering/replay/delta/balance/supply/snapshot)

---

## License
MIT (recommended)
