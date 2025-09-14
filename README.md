# Transaction Inclusion Precise Slasher

This project implements a complete transaction inclusion slashing system using zero-knowledge proofs. It demonstrates how block proposers can be slashed for making false transaction inclusion commitments.

## Overview

The system enables:
- **Proposer Commitments**: Block proposers make EIP-712 signed commitments to include transactions at specific indices
- **Bond Management**: Proposers stake 0.1 ETH bonds with time-delayed withdrawals 
- **Violation Detection**: Users detect when proposers include different transactions than committed
- **ZK Proof Slashing**: Generate proofs using SP1 to slash violators on-chain
- **Real-time Proving**: Integration with Succinct Prover Network for live proof generation
- **Interactive Demo**: Complete React UI for testing the entire slashing workflow

## Key Components

1. **Smart Contracts**: `TxInclusionPreciseSlasher.sol` - Bond management and slashing logic
2. **ZK Program**: SP1 RISC-V program for transaction inclusion verification  
3. **Demo UI**: React application with MetaMask integration
4. **Backend Service**: Node.js service for real-time proof generation
5. **Rust Scripts**: Integration with Succinct Prover Network

## Requirements

- [Rust](https://rustup.rs/)
- [SP1](https://docs.succinct.xyz/docs/sp1/getting-started/install)
- [Foundry](https://getfoundry.sh/) (for smart contract testing)
- [Node.js](https://nodejs.org/) (for demo UI and backend)
- Docker (for EVM-compatible proof generation)

## Project Structure

```
├── program/                    # SP1 RISC-V program for transaction inclusion verification
├── script/                     # Rust scripts for proof generation and Succinct network integration
├── contracts/                  # Solidity smart contracts and demo UI
│   ├── src/                   # Smart contracts (TxInclusionPreciseSlasher.sol, etc.)
│   ├── test/                  # Foundry tests
│   ├── script/                # Deployment scripts
│   └── demo/                  # React demo application
│       ├── src/               # React components and utilities
│       ├── backend/           # Node.js backend service
│       └── REAL_TIME_PROVING_SETUP.md
├── lib/                       # Shared library for transaction inclusion logic
└── README.md
```

## Quick Start

### Option A: Demo UI (Recommended)

Experience the complete slashing workflow through the interactive demo:

1. **Setup Environment**:
   ```sh
   # Configure your Succinct network private key (optional for demo)
   echo "NETWORK_PRIVATE_KEY=0x..." > .env
   ```

2. **Deploy Contracts** (Sepolia testnet):
   ```sh
   cd contracts
   forge script script/DeployTxInclusionPreciseSlasher.s.sol --broadcast --rpc-url https://ethereum-sepolia-rpc.publicnode.com
   ```

3. **Start Demo Application**:
   ```sh
   cd demo
   npm install
   npm start
   ```

4. **Experience the Slashing Flow**:
   - Connect MetaMask to Sepolia testnet
   - Switch between Proposer and User tabs
   - Make commitments, detect violations, generate proofs, execute slashing

### Option B: Direct Proof Generation

For direct interaction with the ZK proof system:

1. **Setup Environment**:
   ```sh
   # Set your Succinct network private key
   echo "NETWORK_PRIVATE_KEY=0x..." > .env
   ```

2. **Test Transaction Inclusion** (Local execution):
   ```sh
   cd script
   cargo run --release -- --execute
   ```

3. **Generate EVM-Compatible Proofs** (Succinct Network):
   ```sh
   cd script
   # Use default hardcoded transaction
   cargo run --release --bin evm_prover_network -- --system groth16
   
   # Generate proof for specific transaction
   cargo run --release --bin evm_prover_network -- \
     --system groth16 \
     --transaction-hash 0xd25efc79e658a77d3a136a674c04be15a1d2dfc2a695412028a9e51f5c1ee900
   ```

4. **Test Smart Contracts**:
   ```sh
   cd contracts
   forge test
   ```

## Available Commands

### Demo Application

| Command | Purpose | Location |
|---------|---------|----------|
| `npm start` | Start React demo UI | `contracts/demo/` |
| `npm start` | Start backend service | `contracts/demo/backend/` |

### Contract Operations

| Command | Purpose | Location |
|---------|---------|----------|
| `forge test` | Run all contract tests | `contracts/` |
| `forge test --match-contract TxInclusionPreciseSlasherTest` | Run slasher tests | `contracts/` |
| `forge script script/DeployTxInclusionPreciseSlasher.s.sol --broadcast` | Deploy slasher contract | `contracts/` |
| `forge script script/DeployTransactionInclusionVerifier.s.sol --broadcast` | Deploy verifier contract | `contracts/` |

### Proof Generation Scripts

| Script | Purpose | Requirements |
|--------|---------|--------------|
| `cargo run --release -- --execute` | Execute program locally | Local |
| `cargo run --release -- --prove` | Generate core proof | Local |
| `cargo run --release --bin evm_prover_network` | Prover network EVM proofs (recommended) | Network key + PROVE tokens |
| `cargo run --release --bin evm_prover_network -- --transaction-hash 0x...` | Generate proof for specific transaction | Network key + PROVE tokens |
| `cargo run --release --bin evm --local` | Local EVM proofs | 128GB RAM + Docker |
| `cargo run --release --bin vkey` | Get verification key | Local |

### Utility Scripts

```sh
# Fix fixture encoding (if needed)
cargo run --release --bin fix_fixture

# Get verification key for contracts
cargo run --release --bin vkey
```

## Demo Application Features

### Interactive Slashing Workflow

The React demo provides a complete end-to-end experience:

1. **Proposer Tab**:
   - Bond management (stake 0.1 ETH, initiate/complete withdrawals)
   - Create EIP-712 signed transaction inclusion commitments
   - View current bond status and pending withdrawals

2. **User Tab**:
   - Verify proposer commitments and signatures
   - Check actual transaction inclusion against commitments
   - Detect violations (different transaction at promised index)
   - Generate ZK proofs for slashing violators
   - Execute slashing transactions to burn violator bonds

### Real-time Proof Generation

The system supports two modes:

1. **Fixture Mode**: Uses pre-generated proof for specific scenario:
   - Block: 23354683, Transaction Index: 87
   - Instant proof generation for testing

2. **Live Mode**: Real-time proof generation via Succinct network:
   - Integrates with your Rust `evm_prover_network` binary
   - Generates proofs for any transaction violation
   - Requires PROVE tokens and network configuration

### Backend Integration

The Node.js backend service (`contracts/demo/backend/`) provides:
- REST API for proof generation requests
- Integration with Rust binary execution
- Cost estimation and status monitoring
- Automatic fallback between real-time and fixture proofs

**Setup Real-time Proving**:
```sh
# 1. Install backend dependencies
cd contracts/demo/backend && npm install

# 2. Build Rust binary
cd ../../../script && cargo build --release --bin evm_prover_network

# 3. Start backend service
cd ../contracts/demo/backend && npm start

# 4. Start frontend
cd .. && npm start
```

## Succinct Prover Network Setup

### Prerequisites

1. **PROVE Tokens**: Acquire PROVE tokens on Ethereum Mainnet
2. **Deposit**: Deposit tokens into the Succinct Prover Network
3. **Private Key**: Generate a Secp256k1 key pair and fund it with PROVE tokens

### Configuration

Set your private key in `.env`:

```env
NETWORK_PRIVATE_KEY=0x1234567890abcdef...
```

### Advantages

- ✅ **No Local Resources**: No need for 128GB RAM
- ✅ **Faster Generation**: Optimized GPU clusters
- ✅ **Cost Effective**: Pay only for what you use
- ✅ **Reliable**: Professional infrastructure
- ✅ **Monitoring**: Track proofs on [Succinct Explorer](https://explorer.succinct.xyz)

## Smart Contract Architecture

### Core Contracts

1. **`TxInclusionPreciseSlasher.sol`**: Main slashing contract
   - Bond management with 0.1 ETH minimum and 1-day withdrawal delay
   - EIP-712 signature verification for commitments  
   - ZK proof-based slashing with 100% bond burn
   - Integration with SP1 verifier for proof validation

2. **`TransactionInclusionVerifier.sol`**: ZK proof verification
   - Wraps SP1 gateway for transaction inclusion proofs
   - Returns structured public values for easy consumption

### Deployment Configuration

**Verification Key**: `0x00a1bde4932d9b0fdf65b292dba44b3b23131b5d925592a06fe17735e3d49769`

#### Supported Networks

| Network | Groth16 Gateway | PLONK Gateway |
|---------|----------------|---------------|
| Ethereum Mainnet | `0x397A5f7f3dBd538f23DE225B51f532c34448dA9B` | `0x3B6041173B80E77f038f3F2C0f9744f04837185e` |
| Sepolia | `0x397A5f7f3dBd538f23DE225B51f532c34448dA9B` | `0x3B6041173B80E77f038f3F2C0f9744f04837185e` |
| Arbitrum | `0x397A5f7f3dBd538f23DE225B51f532c34448dA9B` | `0x3B6041173B80E77f038f3F2C0f9744f04837185e` |

### Deployment Commands

```sh
# Deploy both contracts
cd contracts

# Deploy verifier
forge script script/DeployTransactionInclusionVerifier.s.sol \
  --broadcast --rpc-url https://ethereum-sepolia-rpc.publicnode.com

# Deploy slasher (update VERIFIER_ADDRESS in script first)
forge script script/DeployTxInclusionPreciseSlasher.s.sol \
  --broadcast --rpc-url https://ethereum-sepolia-rpc.publicnode.com
```

### Contract Usage

#### Slashing Contract Interface

```solidity
// Bond management
contract.addBond{value: 0.1 ether}();
contract.initiateWithdrawal(amount);
contract.completeWithdrawal();

// Slashing
contract.slash(
    commitment,     // InclusionCommitment struct
    proposer,       // Signer address
    v, r, s,       // EIP-712 signature
    publicValues,   // ABI-encoded proof data
    proofBytes      // ZK proof bytes
);
```

#### EIP-712 Commitment Structure

```solidity
struct InclusionCommitment {
    uint64 blockNumber;
    bytes32 transactionHash;
    uint64 transactionIndex;
    uint256 deadline;
}
```

## Configuration

### Transaction Configuration

To verify different transactions, update `INCLUDED_TX` in `lib/src/lib.rs`:

```rust
pub const INCLUDED_TX: &str = "0xd54acc3d86cf83ee241a6ad2cc5d394e91d142b85c96d7611b72bc267a9f9436";
```

### Network Configuration

Update RPC URL for different networks:

```sh
cargo run --release --bin evm_prover_network -- --eth-rpc-url https://your-rpc-url --system groth16
```

## Example Workflows

### Demo UI Slashing Flow

1. **Proposer creates commitment**:
   ```
   Block: 23354683, Index: 87
   Transaction: 0xc936613ff8e7fb04ed39ef9e25417f779b187d449b04c7ade75917ff33166021
   Deadline: 2025-01-15T12:00:00.000Z
   ```

2. **User detects violation**:
   ```
   ❌ Commitment Violation Detected: A different transaction was included
   Actual transaction: 0xd54acc3d86cf83ee241a6ad2cc5d394e91d142b85c96d7611b72bc267a9f9436
   ```

3. **Proof generation**:
   ```
   ✅ Using real Succinct proof for slashing
   Proof Type: SUCCINCT_GROTH16
   Block Number: 23354683, Index: 87
   Is Included: true
   ```

4. **Slashing execution**:
   ```
   ✅ Slashing successful! Bond burned: 0.1 ETH
   Transaction: 0xabc123...
   Gas used: 489,234
   ```

### Direct Proof Generation

Successful proof generation will show:

```
✅ Network private key found in environment
Transaction found in block: 23354683, index: 87
🎉 SUCCESS: Trie root MATCHES block transactions root!
✅ Host validation successful - merkle proof is valid!

=== PROOF REQUEST SUBMITTED ===
Proof request submitted to Succinct Prover Network!
Monitor your proof at: https://explorer.succinct.xyz/request/0x...

✅ EVM-compatible proof generated successfully using Succinct Prover Network!

=== EVM PROOF FIXTURE GENERATED ===
Verification Key: 0x00a1bde4932d9b0fdf65b292dba44b3b23131b5d925592a06fe17735e3d49769
Block Hash: 0xc936613ff8e7fb04ed39ef9e25417f779b187d449b04c7ade75917ff33166021
Block Number: 23354683
Transaction Hash: 0xd54acc3d86cf83ee241a6ad2cc5d394e91d142b85c96d7611b72bc267a9f9436
Is Included: true
```

## Testing

Run comprehensive tests:

```sh
# Test all contracts
cd contracts && forge test

# Test with verbose output
forge test -vv

# Test specific functions
forge test --match-test test_ValidTransactionInclusionProof
```

## Troubleshooting

### Demo Application Issues

1. **"MetaMask not connected"**: 
   - Install MetaMask extension
   - Connect to Sepolia testnet
   - Ensure account has test ETH

2. **"Contract not deployed"**:
   - Deploy contracts using the deployment scripts
   - Update contract addresses in `demo/src/contracts.js`

3. **"Cannot generate slashing proof"**:
   - Use fixture scenario (block 23354683, index 87) for testing
   - Or configure Succinct network for real-time proving
   - Check backend service is running for live proofs

4. **"Backend service not configured"**:
   - Set `NETWORK_PRIVATE_KEY` in root `.env` file
   - Build Rust binary: `cargo build --release --bin evm_prover_network`
   - Install backend dependencies: `cd demo/backend && npm install`

### Proof Generation Issues

1. **Network Private Key**: Ensure `NETWORK_PRIVATE_KEY` is set and funded with PROVE tokens
2. **RAM Requirements**: Local EVM proof generation requires 128GB RAM - use network instead
3. **Fixture Format**: Use `fix_fixture` script if public values encoding is incorrect
4. **RPC Limits**: Use a reliable Ethereum RPC endpoint for transaction data

### Debug Commands

```sh
# Check verification key
cargo run --release --bin vkey

# Validate transaction data
cargo run --release -- --execute

# Fix fixture encoding
cargo run --release --bin fix_fixture

# Test contract deployment
cd contracts && forge test -vv

# Check backend status
curl http://localhost:3001/api/status

# Test demo UI
cd contracts/demo && npm start
```

## Resources

- [SP1 Documentation](https://docs.succinct.xyz/)
- [Succinct Prover Network](https://docs.succinct.xyz/docs/sp1/prover-network/quickstart)
- [SP1 Contract Addresses](https://docs.succinct.xyz/docs/sp1/verification/contract-addresses)
- [Succinct Explorer](https://explorer.succinct.xyz)

## License

MIT