# TxInclusionPreciseSlasher Demo

React UI and Node backend for exercising the transaction-inclusion slashing demo.

The demo flow is:

1. Backend proposer signs an exact-position commitment with `PROPOSER_PRIVATE_KEY`.
2. User verifies the EIP-712 signature in the browser.
3. User checks the connected network for the promised transaction position.
4. User generates an SP1 proof through the backend.
5. Backend registers canonical block metadata with `OWNER_PRIVATE_KEY`.
6. User submits the slashing transaction from MetaMask.

## Setup

Create a root `.env` at the repository root:

```env
SP1_PROVER=network
NETWORK_PRIVATE_KEY=0x...
PROPOSER_PRIVATE_KEY=0x...
OWNER_PRIVATE_KEY=0x...
```

Build the Rust proof binary used by the backend:

```sh
cd ../..
cargo build --release --bin evm
```

Install frontend dependencies:

```sh
cd contracts/demo
npm install
```

Install backend dependencies:

```sh
cd backend
npm install
```

## Run

Terminal 1:

```sh
cd contracts/demo/backend
npm start
```

Terminal 2:

```sh
cd contracts/demo
npm start
```

Open `http://localhost:3000`.

## UI Tabs

### Proposer

The Proposer tab shows the backend proposer address and balance, then lets that configured proposer:

- add bond
- initiate withdrawal
- complete withdrawal
- view current bond and withdrawal state

The connected wallet is not used as the proposer.

### User

The User tab uses the connected wallet as the user/slasher.

It loads a recent finalized block from the connected network and offers three commitment cases:

- **Fulfilled commitment**: the promise matches the block.
- **Different transaction at promised position**: the block contains a different transaction at that position.
- **No transaction at promised position**: the promised position is past the end of the block.

After requesting a proposer commitment, the verification form is auto-filled, but it remains editable for manual testing.

## Contract Addresses

`src/contracts.js` contains the current demo addresses. `../deploy-and-verify.sh` updates this file after successful deployments.

Current Sepolia configuration:

```js
export const CONTRACTS = {
  SEPOLIA: {
    SLASHER: '0x047c9fBa113c14e3F7F987C9D8F29dd3C0160796',
    VERIFIER: '0xCa1BA4D2630cC7aCa1F7ef463498a83151A56166',
  },
  MAINNET: {
    SLASHER: '',
    VERIFIER: '',
  }
};
```

## Backend

The backend exposes:

- proposer status and bond transactions
- proposer EIP-712 commitment signing
- real-time proof generation via `target/release/evm`
- owner canonical block registration before slashing

It reads environment variables from the repository root `.env`.

## Exact-Position Semantics

The signed commitment means:

```text
txHashAt(blockNumber, transactionIndex) == transactionHash
```

The contract can slash when a proof shows:

- a different transaction at that exact index, or
- no transaction at that exact index

The demo does not prove whole-block omission or whether the signer was the canonical proposer/builder for the block.

## Build

```sh
npm run build
```

The generated `build/` directory is ignored by git.

## Troubleshooting

- **Backend says prover network is not configured**: check root `.env` for `NETWORK_PRIVATE_KEY` and rebuild `target/release/evm`.
- **Proposer key missing**: set `PROPOSER_PRIVATE_KEY` in the root `.env` and restart the backend.
- **Canonical block registration fails**: set `OWNER_PRIVATE_KEY`, ensure it matches the deployed slasher owner, and fund it for gas.
- **Slasher contract not found**: redeploy from `contracts/` or update `src/contracts.js`.
- **Frontend cannot reach backend**: set `REACT_APP_BACKEND_URL` if the backend is not running on `http://localhost:3001`.
