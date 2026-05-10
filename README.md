# Transaction Inclusion Precise Slasher

This repo is a working demo of exact-position transaction-inclusion commitments and slashing. A backend proposer signs an EIP-712 promise that a transaction will appear at a specific position in a block; the UI lets a user verify the promise, check the block, generate an SP1 proof through the Succinct Prover Network, and slash the proposer for supported violations.

The demo is intentionally narrow: it proves exact-position failures. It does not prove whole-block omission, missed proposer duty, or canonical proposer/builder identity.

## What To Try

Use the React demo in `contracts/demo` as the main entry point.

The User tab offers three cases:

- **Fulfilled commitment**: the promised transaction is actually at the promised position.
- **Different transaction at promised position**: the block contains a different transaction at that position.
- **No transaction at promised position**: the promised position is past the end of the block.

The Proposer tab uses `PROPOSER_PRIVATE_KEY` from the backend environment, not the connected browser wallet. The owner-controlled canonical block registration step uses `OWNER_PRIVATE_KEY` from the backend environment before slashing.

## Quick Start

Create a root `.env`:

```env
SP1_PROVER=network
NETWORK_PRIVATE_KEY=0x...
PROPOSER_PRIVATE_KEY=0x...
OWNER_PRIVATE_KEY=0x...
```

Build the proof binary used by the backend:

```sh
cargo build --release --bin evm
```

Start the backend:

```sh
cd contracts/demo/backend
npm install
npm start
```

Start the frontend in a second terminal:

```sh
cd contracts/demo
npm install
npm start
```

Open `http://localhost:3000`, connect MetaMask, and use the User tab to request a commitment, verify it, check inclusion, generate a proof, and slash when a supported violation is detected.

## Current Contracts

Contract deployment and testing commands live in [contracts/README.md](./contracts/README.md). The demo reads contract addresses from [contracts/demo/src/contracts.js](./contracts/demo/src/contracts.js), and `contracts/deploy-and-verify.sh` updates those addresses after deployments.

The core contracts are:

- `TransactionInclusionVerifier`: wraps SP1 proof verification and decodes transaction-inclusion public values.
- `TxInclusionPreciseSlasher`: manages proposer bonds, verifies signed exact-position commitments, anchors canonical block metadata, and burns 0.1 ETH for valid slash proofs.

## Repository Layout

```text
program/                 SP1 program
script/                  Rust proof-generation binaries
lib/                     Shared transaction-inclusion logic
contracts/src/           Solidity contracts
contracts/test/          Foundry tests
contracts/script/        Deployment and owner scripts
contracts/demo/          React UI and Node backend
docs/                    Design notes and production gaps
```

## Useful Commands

```sh
# Rust checks
cargo check
cargo test

# Contract tests
cd contracts
forge test

# Frontend build
cd contracts/demo
npm run build

# Backend smoke check
node -e "const app = require('./contracts/demo/backend/server.js'); console.log(typeof app)"
```

## Direct Proof Generation

The UI is the preferred way to exercise the flow. For lower-level debugging, the `evm` binary can generate fixtures directly:

```sh
# Inclusion proof for the first transaction in a recent finalized block
SP1_PROVER=network cargo run --release --bin evm -- --system groth16

# Inclusion proof for a specific mined transaction
SP1_PROVER=network cargo run --release --bin evm -- \
  --system groth16 \
  --transaction-hash 0x...

# Absence proof for a specific block/index
SP1_PROVER=network cargo run --release --bin evm -- \
  --system groth16 \
  --absence-block-number 123 \
  --absence-transaction-index 456 \
  --transaction-hash 0x...

# Different-transaction proof: prove the actual tx at the index while binding a separate committed tx
SP1_PROVER=network cargo run --release --bin evm -- \
  --system groth16 \
  --transaction-hash 0xACTUAL_TX_AT_POSITION \
  --committed-transaction-hash 0xCOMMITTED_TX
```

Generated fixtures are written under `contracts/src/fixtures/`.

## Notes

- Local EVM proof generation can be resource-heavy; the demo flow assumes Succinct network proving.
- The canonical block hash/timestamp registration is a demo-grade owner anchor, not a production historical canonicality design.
- For production considerations, see [docs/PRODUCTION_GAPS.md](./docs/PRODUCTION_GAPS.md).
