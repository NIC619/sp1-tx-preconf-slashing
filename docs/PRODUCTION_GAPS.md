# Demo To Production Gaps

This document tracks the main gaps between the current demo implementation and a production-grade transaction-inclusion slashing protocol.

The current repository is useful as a proof-of-concept for SP1-backed inclusion evidence and a simple slash path. It should not be read as a complete production preconfirmation protocol.

## Current Demo Boundary

The demo currently supports two slashable exact-position violations:

- a proposer signed a commitment for `transactionHash` at `transactionIndex` in `blockNumber`;
- the challenger proves that a different transaction was included at that same index in that same block, or that no transaction exists at that same index;
- the proof's `blockHash` must match a registered canonical block hash;
- the proposer has enough bond to burn the fixed slash amount.

The intended demo semantics are exact-position inclusion: fulfillment requires the committed transaction hash at exactly the committed transaction index.

It does not currently slash:

- broader "transaction appears anywhere in block" promises,
- missed proposal duty,
- proposer/builder identity failures,
- conflicting commitments,
- replay across richer commitment domains,
- or production collateral and withdrawal-reservation failures.

## 1. Canonical Block Anchoring

Demo state:

- The slasher has `canonicalBlockHashes[blockNumber]`.
- The owner registers a block hash and timestamp with `registerCanonicalBlock(blockNumber, blockHash, blockTimestamp)`.
- The proof output must match that registered hash.
- The proof also exposes `verifiedAgainstRoot`, the transaction trie root from the proved block header. This is
  informational in the current demo because the enforced block hash commits to that header/root.

Why this is not production-ready:

- The registration source is trusted.
- The contract does not independently prove that the registered hash is canonical.
- The mechanism can support tests and demos, but it is not a decentralized historical-block oracle.

Production directions:

- For recent same-chain blocks, use the EVM `blockhash` window and require submitted headers to match the trusted block hash.
- For older-but-still-recent consensus data, use EIP-4788 beacon roots plus proofs from the beacon root to the execution payload/header, then to the transaction trie.
- For older history, use a header oracle, checkpoint system, light-client proof, or another explicitly trusted canonicality source.
- If a future design registers transaction roots directly instead of whole block hashes, enforce the proof's
  `verifiedAgainstRoot` against that registered root.

Open design question:

- Should commitments target the same chain where the slasher lives, or can the slasher adjudicate commitments about another chain through an oracle/bridge-style anchor?

## 2. Proof Statement Completeness

Demo state:

- The SP1 program proves inclusion of one raw transaction at one precise index under a supplied transaction root.
- It also supports exact-index absence proofs for `NO_TRANSACTION_AT_INDEX`.
- It does not prove whole-block non-inclusion under broader "appears anywhere" semantics.

Why this is not production-ready:

- Exact-position omission is slashable, but broader omission semantics are not.
- If the intended production promise is "include this transaction anywhere in the block," exact-index absence is insufficient.

Production directions:

- Define the exact promise first.
- Add proof modes for every slashable violation under that promise.
- Make the public values encode a violation type, not just `isIncluded`.

Near-term demo direction:

- Keep hardening CLI/backend/UI support for exact-index exclusion proofs for `NO_TRANSACTION_AT_INDEX`.
- Treat empty blocks and index-out-of-range promises as instances of exact-index absence.
- Do not claim whole-block omission unless the commitment semantics are changed from exact-position inclusion.

Missed proposal note:

- The current demo does not prove that the commitment signer was the proposer/builder responsible for the target canonical block.
- If the signer fails to propose and someone else proposes the canonical block, the demo judges the promise against the canonical block contents only.
- Production missed-duty slashing needs separate proposer-assignment evidence and incentive design.

## 3. Commitment Semantics

Demo state:

- `InclusionCommitment` binds only `blockNumber`, `transactionHash`, and `transactionIndex`.
- The demo semantics are exact-position inclusion: the signer promises
  `txHashAt(blockNumber, transactionIndex) == transactionHash`.
- The EIP-712 domain binds the signature to the deployed slasher contract and chain ID, but the struct itself does not
  bind a target execution chain separate from that signing domain.

Why this is not production-ready:

- The demo specifies exact-position inclusion, but production may need a richer promise model such as
  anywhere-in-block inclusion, inclusion by a slot/time, or inclusion under a particular builder/proposer role.
- It does not bind chain ID, transaction bytes, fee constraints, replacement policy, or a nonce/salt.

Production directions:

- Add an explicit commitment schema version.
- Bind the target chain and domain.
- Decide whether the promise is about a transaction hash, full transaction bytes, sender/nonce intent, or a richer transaction constraint.
- Include a commitment nonce or unique ID if replay and cancellation semantics matter.

## 4. Slashing Window Timing

Demo state:

- The canonical block timestamp registered for `blockNumber` is treated as the fulfillment time.
- Slashing remains available for a fixed 1-day `SLASHING_WINDOW` after that timestamp.

Why this is not production-ready:

- Fulfillment time and slashing time are now separated for the demo, but the slashing window is a fixed constant.
- A production window should depend on the canonical anchor mechanism, finality assumptions, proof-generation latency,
  and withdrawal/collateral reservation design.

Production directions:

- Define a minimum slashing window after the target block becomes available/finalized.
- Align the window with the canonical anchor mechanism. For example, `blockhash` anchoring requires recent disputes; EIP-4788 anchoring has a bounded root-history window.

## 5. Commitment Lifecycle And Registration

Demo state:

- The contract sees the signed commitment only at slash time.
- There is no on-chain record of active promises.

Why this is not production-ready:

- Observability is weak.
- There is no lifecycle for cancellation, replacement, expiry, outstanding exposure, or reserved collateral.
- Off-chain signed commitments can be slashable without registration, but they are harder for third parties to discover
  before a dispute.
- Registration is not required for the current demo slash-soundness path because the slasher verifies the EIP-712
  signature and commitment contents at slash time.

Production directions:

- Consider lightweight commitment registration if lifecycle clarity matters.
- Track outstanding slash exposure if withdrawal safety becomes in-scope.
- Keep registration separate from canonical block registration; they solve different problems.

Current pass decision:

- Deferred. Adding proposer commitment registration now would pull the demo into lifecycle, collateral reservation, and
  cancellation/replacement design. The current pass keeps those topics out of scope.

## 6. Collateral And Withdrawal Safety

Demo state:

- Proposers deposit ETH.
- Slashing burns a fixed amount.
- Withdrawals have a delay but no reservation against outstanding promises.

Why this is not production-ready:

- A proposer could make many commitments against insufficient effective collateral.
- Withdrawal safety is not tied to unresolved promises or slashing windows.

Production directions:

- Define maximum slash exposure per commitment.
- Reserve collateral while promises are outstanding.
- Release reserved collateral only after the relevant slashing window expires.

Status for current pass:

- Deferred. This is important for production, but not part of the current demo-hardening pass.

## 7. Challenger Incentives

Demo state:

- The slash amount is burned.
- There is no challenger reward design.

Why this is not production-ready:

- Challengers pay proof-generation and transaction costs.
- Without rewards or another incentive, valid disputes may not be submitted.

Production directions:

- Decide burn/reward split.
- Account for proof costs and griefing.
- Consider bonds for challenge protocols if false challenges can impose costs.

Status for current pass:

- Deferred.

## 8. Signature And Domain Hardening

Demo state:

- The contract uses a minimal `ecrecover` path.
- The EIP-712 domain is simple.

Why this is not production-ready:

- Malleable or malformed signatures should be rejected with hardened utilities.
- Contract wallets are not supported.
- Commitment domain fields are likely incomplete for multi-chain or upgraded deployments.

Production directions:

- Use hardened ECDSA utilities.
- Decide whether ERC-1271 contract signatures are required.
- Include schema versioning and stronger replay domains.

## 9. UI And Documentation Truthfulness

Demo state:

- The UI now distinguishes slashable `DIFFERENT_TRANSACTION` cases from detected-but-not-slashable cases.
- The README and design review call the repository a demo.

Why this is not production-ready:

- Any new proof mode, commitment type, or anchor mode must be reflected in the UI.
- The demo must not imply that all detected violations are enforceable.

Production directions:

- Treat UI copy as part of the protocol surface.
- Show the exact slash condition being enforced.
- Surface anchor assumptions, proof mode, and slashing-window status.

## Relationship To `SLASHER_DESIGN_REVIEW.md`

`SLASHER_DESIGN_REVIEW.md` tracks the current in-scope hardening work issue by issue.

This document tracks the larger production delta, including topics intentionally deferred from the current pass.
