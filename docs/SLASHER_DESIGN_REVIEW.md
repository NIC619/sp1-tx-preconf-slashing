# Transaction Inclusion Slasher Design Review

This document tracks the current slasher design, the main correctness and security issues we have identified, and the plan for resolving them one by one.

It is intended to be a living design note. As we make decisions, we should update this file alongside the code.

For the broader demo-to-production delta, including topics intentionally deferred from this pass, see `docs/PRODUCTION_GAPS.md`.

## Scope

This repository is still primarily a demo, not a production preconfirmation protocol.

That means we are currently prioritizing:

- slash soundness,
- correctness of the proof statement,
- clarity of commitment semantics,
- and honest alignment between protocol behavior and the demo UX.

We are not currently prioritizing the full production economics layer such as advanced collateral design, challenger incentives, or complex commitment lifecycle markets.

## Current Design

At a high level, the current system works like this:

1. A proposer signs an EIP-712 `InclusionCommitment`.
2. The commitment promises that a specific transaction hash will appear at a specific transaction index in a specific block.
3. The proposer maintains a bond in `TxInclusionPreciseSlasher.sol`.
4. The slasher owner registers the canonical block hash and timestamp for a block number before slashing can succeed.
5. A challenger can submit a zk proof to slash the proposer.
6. The proof shows either that a different transaction was included at the promised index, or that no transaction exists at the promised index.

In the current implementation, the slash path supports:

- `DIFFERENT_TRANSACTION_AT_INDEX`,
- `NO_TRANSACTION_AT_INDEX`.

It does not currently support broader failure cases such as:

- whole-block non-inclusion under "appears anywhere" semantics,
- proposer missed-slot / failed-to-propose evidence,
- or broader proposer-duty failures.

## Current Proof Statement

The SP1 program currently proves either:

- inclusion of a supplied raw transaction at a supplied index under a supplied transaction trie root taken from a supplied block header, or
- absence of any transaction at a supplied index under that same transaction trie root.

The slasher currently checks:

- the commitment signature is valid,
- the proof is valid for the SP1 program,
- the proof's `blockNumber` matches the committed block number,
- the proof's `blockHash` matches the registered canonical block hash for that block number,
- the proof's `transactionIndex` matches the committed transaction index,
- and either:
  - `isIncluded == true`, the proved transaction hash is nonzero, and the proved transaction hash differs from the committed transaction hash, or
  - `isIncluded == false` and the proved transaction hash is the zero sentinel for exact-index absence.

The `transactionIndex` public value is intentionally shared by both proof modes. In inclusion mode it is the index of
the included transaction. In absence mode it is the transaction-trie key that the proof proves absent. Therefore the
same `TransactionIndexMismatch` check applies to `DIFFERENT_TRANSACTION_AT_INDEX`, `NO_TRANSACTION_AT_INDEX`, empty
block, and index-out-of-range cases: the challenger must prove something about the exact position the proposer promised,
not merely prove that some other position is filled or empty.

The current canonicality check is deliberately lightweight: the contract trusts an owner-registered block hash. This removes the immediate "arbitrary fake header/root" slash path for the demo, but it shifts trust to the registration process. It is not a production-grade historical canonical-header proof.

## In-Scope Issue List

These are the issues we plan to address in this demo-oriented hardening pass.

### 1. Canonical block anchoring

Severity: critical

Problem:

The proof is currently checked against a user-supplied block header and trie root, but the slasher does not verify that this header is the real canonical block header for the committed block number.

Consequence:

A malicious challenger may be able to construct a valid zk proof over a fake header/root and slash an honest proposer.

Status:

- Complete for the current exact-position demo semantics.

Production/broader-semantics gaps remain, but they are now tracked as deferred scope rather than as blockers for this
issue.

Current implementation:

- `TxInclusionPreciseSlasher` now has `canonicalBlockHashes[blockNumber]` and
  `canonicalBlockTimestamps[blockNumber]`.
- The owner can call `registerCanonicalBlock(blockNumber, blockHash, blockTimestamp)`.
- `slash` reverts unless a nonzero canonical hash has been registered for the committed block number.
- `slash` also reverts unless the proof's public `blockHash` equals the registered canonical hash.

Trust assumption:

- The registered block hash must come from a correct canonical-data source.
- Today that source is the contract owner / deployment operator.
- This is acceptable as a demo-hardening step because it prevents challengers from choosing arbitrary private headers, but it is not decentralized canonicality.

Planned direction:

- Keep the owner-registered hash as the current demo mechanism.
- Before calling this production-ready, replace the trusted registration step with a canonical source appropriate to the intended time horizon, such as same-chain recent `blockhash` anchoring, a finalized-header oracle, a beacon/EIP-4788-derived construction, or a verified header-chain proof.
- Decide whether commitments are meant to refer to the same chain as the slasher contract. The current demo UI fetches Ethereum mainnet execution data while deployments may be on testnets; an owner-registered hash can bridge that for demos, but native `blockhash` anchoring cannot.

Reference note:

- The `eth-fabric/urc` repo is a strong reference for overall proposer-commitment slashing architecture and dispute flow.
- In particular, `example/InclusionPreconfSlasher.sol` and `example/StateLockSlasher.sol` show how to verify transaction inclusion against canonical execution blocks using a trusted anchor and then derive the target block header from that anchor.
- However, those example slashers do not solve the exact same canonicality problem we currently have. Their inclusion verification relies on recent-block trust assumptions using `blockhash(previousBlockNumber)` plus parent-hash linkage, with strict recency/finality limits. That is useful for short-horizon fraud proofs, but it is not by itself a drop-in solution for our current "arbitrary supplied header/root inside a zk proof" problem.
- The same URC example contracts also include EIP-4788 helper functions and beacon-root accessors, which are conceptually relevant, but in the current examples the main execution-block anchoring path is still the recent `blockhash` anchor rather than a full historical canonical-header proof.

EIP-4788 anchor note:

- EIP-4788 exposes recent beacon block roots through the beacon roots contract, with `HISTORY_BUFFER_LENGTH = 8191`.
- This gives a larger recent-root window than the EVM `blockhash` lookback, but it is still a bounded ring buffer, not arbitrary history.
- EIP-4788 gives a consensus-layer root. To use it for execution transaction inclusion, evidence must additionally prove that the relevant execution payload/header is committed under that beacon root, then prove the transaction against the execution payload's transaction root.
- Therefore an EIP-4788 version of our slasher would need proof inputs for both layers: consensus SSZ/Merkle proof from beacon root to execution payload data, plus execution transaction-trie proof from `transactionsRoot` to the indexed transaction.

URC test-model note:

- The URC inclusion/state-lock slasher tests use a mainnet fork, roll the EVM block number to the target block, and rely on Foundry's forked `blockhash()` for the recent previous execution block.
- They use real historical block headers and transaction MPT proofs from testdata, but the proposer/delegation/committer keys are deterministic test keys created inside the test harness.
- This is not a contradiction: canonical Ethereum validators sign/produce the block, while the URC operator/committer signs the off-chain preconfirmation commitment. Those are different signing domains.
- For our current E2E tests, the analogous step is to register the fixture's proved `blockHash` before calling `slash`. That keeps the SP1 proof fixture real while keeping the commitment signer under test control.

Why this matters for our repo:

- We should treat `urc` as a protocol and architecture reference, not as something to copy mechanically.
- For issue #1, the key lesson is the trust-model discipline: canonicality must come from a trusted on-chain anchor, and the rest of the evidence may only extend from that anchor.
- For this pass, the owner-registered hash is the explicit trusted on-chain anchor.
- We still need to choose a less trusted anchoring design if the project moves beyond the demo.

### 2. Slash condition completeness

Severity: critical

Problem:

The original slasher only handled "different transaction at the same index." The demo now also handles exact-index absence, but broader promise failures remain outside the current proof statement.

Consequence:

A dishonest proposer can break the promise in several ways and still avoid punishment.

Remaining examples:

- the transaction is absent from the whole block under "appears anywhere" semantics,
- the signer failed to propose the target block,
- the signer was not actually the proposer/builder for the target block,
- the promise semantics require broader fulfillment than exact-position replacement.

Status:

- Complete for the current exact-position demo semantics.

Production/broader-semantics gaps remain, but they are now tracked as deferred scope rather than as blockers for this
issue.

Demo semantic decision:

- Keep the demo promise as exact-position inclusion.
- The proposer promises that the committed transaction hash appears exactly at `transactionIndex` in the canonical `blockNumber`.
- The demo does not currently promise "appears anywhere in the block."

Required slashable violation types under exact-position semantics:

- `DIFFERENT_TRANSACTION_AT_INDEX`: a different transaction exists at the promised index.
- `NO_TRANSACTION_AT_INDEX`: the transaction trie has no value at the promised index.

Committed-transaction eligibility:

- The proof now carries two transaction concepts:
  - `committedTransactionHash`: the user transaction from the signed commitment, whose sender/account eligibility is
    checked.
  - `transactionHash`: the transaction proved at `transactionIndex`, or the zero sentinel for exact-index absence.
- The slasher requires `proofOutput.committedTransactionHash == commitment.transactionHash`. Without this binding, a
  proof could establish that some transaction is at the promised index while proving eligibility for a different user
  transaction.
- The SP1 program proves target-block eligibility for the committed transaction against the parent block state root:
  - the target block header must be the direct child of the supplied parent block header;
  - the committed transaction signer is recovered from the signed transaction bytes;
  - the signer's account proof is verified against the parent state root;
  - the parent-state nonce must equal the committed transaction nonce;
  - the sender balance must cover transaction value plus upfront gas and blob fee caps;
  - the transaction fee cap/gas price must cover the target block base fee.
- This check covers the main invalidation cases where the user already consumed the nonce in an earlier block, or spent
  enough ETH before the promised block to make the committed transaction unfundable.

Same-block prefix assumption:

- The eligibility proof is a start-of-block check. It does not execute or prove the state transition prefix before
  `transactionIndex`.
- Therefore it does not cryptographically rule out an earlier transaction in the same target block consuming the same
  sender nonce or enough balance before the promised index.
- For the current demo this is an accepted proposer-accountability assumption: the commitment signer is treated as the
  block builder/proposer for the target block, so including an earlier invalidating transaction is itself a choice that
  causes the signed exact-position promise to fail and remain slashable.
- A production design that does not want this assumption should add an execution-prefix/state-transition proof, or
  change the commitment semantics to make same-block replacement/cancellation rules explicit.

Coverage:

- `NO_TRANSACTION_AT_INDEX` covers the promised index being out of range, the block being empty, and the slot at that transaction-index key being absent.
- It does not prove that the transaction is absent from the whole block; that is acceptable only because the demo promise is exact-position inclusion.

Proof-system note:

- `alloy_trie::proof::verify_proof` supports exclusion proofs by passing `None` as the expected value.
- The SP1 input now includes `prove_absence`.
- The public values keep the existing ABI for fixture compatibility: `isIncluded == false` and `transactionHash == bytes32(0)` encodes `NO_TRANSACTION_AT_INDEX`.
- For an empty block, the proof can be an empty-root exclusion proof.
- In all absence cases, the public `transactionIndex` is the promised index being proved absent. This is why the
  Solidity slasher can use the same `proofOutput.transactionIndex == commitment.transactionIndex` invariant for empty
  block, index-out-of-range, and ordinary no-transaction-at-index proofs.

Public-values ABI decision:

- Keep the current zero-hash sentinel for this demo checkpoint.
- Before treating the proof ABI as stable, replace the sentinel with an explicit proof mode / violation type.
- The preferred future public-values shape is to encode the proof mode directly, e.g. `INCLUDED_TRANSACTION_AT_INDEX`
  or `NO_TRANSACTION_AT_INDEX`, alongside `blockNumber`, `blockHash`, `transactionIndex`, and `transactionHash`.
- Do not add separate contract-level modes for `EMPTY_BLOCK` or `INDEX_OUT_OF_RANGE` unless product requirements make
  those protocol-distinct. Under exact-position semantics they are both instances of `NO_TRANSACTION_AT_INDEX`.
- When this ABI changes, regenerate fixtures and update Solidity, CLI, backend, UI, and docs together.

Missed proposer note:

- We are not attempting to prove that the signer actually proposed, or failed to propose, the target block.
- The current slasher adjudicates the signed promise against the canonical block contents.
- If the promise signer did not control the canonical block, that is a separate slot-assignment / proposer-identity problem.
- Production missed-duty slashing would need separate evidence and economics, and remains out of scope for this pass.

Planned direction:

- Continue hardening generated absence-proof fixtures and end-to-end coverage as follow-up quality work.
- Regenerate proof fixtures if we later replace the zero-hash sentinel with an explicit public-values schema version.
- Keep UI copy explicit: broader omissions are detected only if they map to exact-index absence under the demo semantics.

### 3. Commitment semantics are underspecified

Severity: critical

Problem:

The current commitment only binds:

- `blockNumber`,
- `transactionHash`,
- `transactionIndex`

This is not yet a complete preconfirmation intent model.

Consequence:

The dispute logic does not have a sufficiently precise statement of what was promised and what counts as violation.

Status:

- Complete for the current demo commitment schema.

The remaining items in this section are production-schema questions, not blockers for the current exact-position demo.

Current demo semantics:

- `InclusionCommitment` means exact-position transaction-hash inclusion.
- Fulfillment requires `txHashAt(blockNumber, transactionIndex) == transactionHash`.
- Violation occurs when canonical evidence shows either:
  - another transaction hash at that exact index, or
  - no transaction at that exact index.
- The EIP-712 domain binds the signature to the slasher contract address, chain ID, name, and version.
- The `proposer` is not a struct field; it is the address recovered from the EIP-712 signature and checked against the
  bond being slashed.
- Fulfillment time is derived from the registered canonical block timestamp for `blockNumber`, not from a proposer-chosen
  deadline field.

Explicit non-semantics:

- The commitment does not promise anywhere-in-block inclusion.
- The commitment does not prove the signer was the canonical proposer or builder for `blockNumber`.
- The commitment does not bind full transaction bytes, transaction sender/nonce constraints, replacement rules, or
  cancellation rules.
- The commitment does not include a separate nonce/salt. In this demo, uniqueness comes from the committed tuple and
  the slasher's `slashedCommitments[commitmentHash]` replay guard.

Deferred semantics:

- Anywhere-in-block inclusion.
- Inclusion by slot range rather than exact block number.
- Full transaction-byte commitments rather than hash-only commitments.
- Replacement/cancellation semantics.
- Cross-chain or multi-domain commitments beyond the current EIP-712 domain.

Planned direction:

- Keep the current commitment fields for the immediate demo hardening.
- If the proof public values get a schema version, mirror that clarity in commitment docs and UI rather than silently changing commitment meaning.
- Before any production-oriented deployment, introduce an explicit commitment schema/version decision rather than
  extending the meaning of the current three-field struct by implication.

### 4. Slashing-window timing

Severity: high

Problem:

The original commitment included a proposer-chosen `deadline` that directly gated whether slashing was still allowed.

Consequence:

A proposer may be able to choose deadlines that make valid slash proofs impractical to submit in time.

Status:

- Complete for the current demo timing model.

Current implementation:

- `InclusionCommitment` no longer contains a proposer-chosen `deadline`.
- The owner registers the canonical block timestamp alongside the canonical block hash.
- The slasher exposes a fixed `SLASHING_WINDOW` of 1 day.
- `slash` accepts proofs until `canonicalBlockTimestamp + SLASHING_WINDOW`.
- After that cutoff, `slash` reverts with `SlashingWindowExpired`.

Tradeoff:

- This is a simple demo-grade slashing period derived from canonical block data.
- It prevents a proposer from making a promise practically unslashable by setting a very short deadline.
- The owner-registered timestamp is part of the current trusted demo canonical-data anchor.
- It is not a full production slashing-window design because it is not tied to finality, canonical anchor availability,
  proof-generation latency, or collateral reservation.

Planned direction:

- Keep the fixed 1-day slashing window for the demo.
- If the anchoring design changes, revisit the slashing window so it fits the data-availability window. For example,
  recent `blockhash` anchoring requires disputes while the block hash is still available, while EIP-4788-style anchoring
  has a different bounded root-history window.
- Production work should also tie withdrawal safety and outstanding exposure to unresolved commitments through the full
  slashing period.

### 5. On-chain commitment registration

Severity: medium

Problem:

The contract currently only sees the signed commitment at dispute time.

Consequence:

This weakens observability and makes lifecycle handling more implicit than it should be, even for a demo.

Status:

- Deferred for the current demo-hardening pass.

Current implementation:

- The contract now supports a lightweight registration flow for canonical block metadata.
- This registration is not a full commitment lifecycle. It registers chain data, not proposer promises.

Tradeoff:

- On-chain proposer commitment registration would improve observability and make active promises easier for a UI or
  indexer to discover.
- It would also create a natural place to add lifecycle rules such as cancellation, replacement, expiry, and collateral
  reservation.
- Those benefits are not required for the current slash-soundness path because `slash` already verifies the signed
  EIP-712 commitment at dispute time.
- Adding registration now would pull the demo toward broader lifecycle and collateral-reservation design, which is
  intentionally out of scope for this pass.

Planned direction:

- Keep canonical block registration because it anchors chain data needed for proof soundness and slashing-window timing.
- Do not add proposer commitment registration in this pass.
- Revisit proposer commitment registration only if the project moves toward lifecycle UX, outstanding exposure tracking,
  withdrawal reservation, cancellation/replacement semantics, or production collateral accounting.

### 6. Verifier/slasher invariant mismatch

Severity: medium

Problem:

The proof exposes `blockHash` and `verifiedAgainstRoot`, but the slasher does not use them.

Consequence:

Security-relevant proof outputs exist without corresponding enforcement logic.

Status:

- Complete for the current block-hash anchor design.

Current implementation:

- The slasher now enforces `proofOutput.blockHash == canonicalBlockHashes[commitment.blockNumber]`.
- `verifiedAgainstRoot` is emitted/decoded but intentionally not independently checked by the slasher.

Decision:

- Keep `verifiedAgainstRoot` as an informational / debugging public value for the current demo.
- The SP1 program verifies the transaction proof against `input.block_header.transactions_root`.
- The SP1 program then publishes that same header `transactions_root` as `verifiedAgainstRoot`.
- The slasher enforces the block hash, and that block hash commits to the entire block header, including the
  transaction root.
- Therefore, under the current whole-block-hash anchor model, separately registering and checking the transaction root
  would be redundant.

Planned direction:

- Leave `verifiedAgainstRoot` unchecked while the slasher anchors canonicality through the full block hash.
- If a future design anchors transaction roots directly instead of block hashes, promote `verifiedAgainstRoot` from
  informational output to enforced slasher invariant.
- Keep comments and UI/docs clear that `blockHash` is the enforced canonical anchor in this demo.

### 7. UI correctness

Severity: medium

Problem:

The demo UX talks about broader commitment violations than the contract can actually slash today.

Consequence:

The demo can overstate what is currently enforceable.

Status:

- Complete for the current demo semantics.

Current implementation:

- The UI distinguishes detected-but-not-slashable violations from supported exact-position slash paths.
- The UI treats `DIFFERENT_TRANSACTION`, `NO_TRANSACTION`, `EMPTY_BLOCK`, and `INDEX_OUT_OF_RANGE` as slashable
  because they all map to either different-transaction-at-index or no-transaction-at-index proofs.
- The UI states that whole-block omission, missed-duty evidence, and proposer/builder identity failures are not
  supported slash paths.
- The UI maps canonical-anchor errors for missing registered metadata and mismatched registered block hashes.
- The slashing step warns that owner-registered canonical block hash and timestamp are required before slashing can
  succeed.

Planned direction:

- Keep the UI aligned with the exact slash semantics actually implemented.
- When the proof public-values ABI changes, replace sentinel-based copy with explicit proof-mode copy.
- Before deployment, refresh contract addresses/ABIs and discard any old commitment JSON that still includes the removed
  `deadline` field.

### 8. Signature hardening

Severity: low

Problem:

The contract previously used a minimal `ecrecover`-based validation path.

Consequence:

Raw `ecrecover` accepts some malformed or malleable signatures that should not be considered valid commitment
signatures. In particular, a high-`s` malleated signature can recover to the same EOA unless the verifier explicitly
rejects it.

Status:

- Complete for EOA signatures in the current demo.

Current implementation:

- `TxInclusionPreciseSlasher` now verifies the EIP-712 digest with OpenZeppelin `ECDSA.tryRecover`.
- The slasher keeps the existing `InvalidSignature` external error, but hardened recovery now rejects malformed
  signatures, zero-address recovery, invalid `v`, and high-`s` malleable signatures.
- Tests include invalid signer, invalid `v`, and a high-`s` malleated signature that raw `ecrecover` would still recover
  to the proposer.

Deferred:

- ERC-1271 contract-wallet signatures are intentionally out of scope for this demo pass. Supporting them cleanly would
  require deciding whether proposers may be contracts, how proposer identity maps to consensus duties/collateral, and
  whether the commitment schema needs an explicit signer/account abstraction field.

## Out-Of-Scope For This Pass

The following issues are intentionally not part of the current demo hardening pass:

- advanced collateral redesign,
- challenger reward design,
- burn-vs-reward incentive redesign,
- withdrawal reservation against a portfolio of outstanding promises,
- and full replay / conflicting-promise market design.

We may revisit these later if the project moves toward productionization.

## Working Order

We plan to resolve the in-scope issues in roughly this order:

1. canonical block anchoring,
2. slash condition completeness,
3. commitment semantics,
4. slashing-window timing,
5. on-chain commitment registration,
6. verifier/slasher invariant cleanup,
7. UI correctness,
8. signature hardening.

## Decision Log

### 2026-04-24

- Agreed to document the design-review process first and update docs alongside implementation.
- Agreed to focus this pass on correctness and security of the demo rather than full production economics.
- Deferred advanced collateral and incentive work for now.
- Added `eth-fabric/urc` as a reference implementation source for overall slashing architecture.
- Recorded that the URC example slashers are useful for trust-model and dispute-flow design, but their recent-block anchoring approach is not a direct fix for our current canonical-header problem.

### 2026-04-25

- Implemented a demo-grade canonical block anchor in `TxInclusionPreciseSlasher`.
- Added owner-only canonical block registration as the initial demo canonical anchor.
- Updated `slash` so a proof must match the registered canonical block hash for the committed block number.
- Recorded the trust assumption: this prevents arbitrary fake-header proofs in the demo, but it depends on the registration source being honest and correct.
- Tightened UI copy so only `DIFFERENT_TRANSACTION` is described as slashable today.
- Selected exact-position inclusion as the demo commitment semantics.

### 2026-04-26

- Removed proposer-chosen `deadline` from `InclusionCommitment`.
- Changed canonical block registration to include both block hash and block timestamp.
- Defined the demo slashing period as `canonicalBlockTimestamp + SLASHING_WINDOW`.
- Renamed the timing concept from challenge window to slashing window because this protocol uses one-shot zk evidence,
  not an interactive dispute game.
- Added `NO_TRANSACTION_AT_INDEX` as the second demo slash condition, represented by `isIncluded == false` and a zero transaction-hash sentinel.
- Recorded that missed proposal duty / proposer identity is a separate future-work problem, not part of this slash-condition pass.
