# Transaction Inclusion Verification with SP1

This project implements a zero-knowledge proof system for verifying Ethereum transaction inclusion at precise indices using [SP1](https://github.com/succinctlabs/sp1) and the Succinct Prover Network.

## Overview

The system proves that a specific transaction is included at an exact index within an Ethereum block by:
- Generating Merkle proofs using real Ethereum transaction data
- Creating ZK proofs using SP1's RISC-V zkVM
- Verifying proofs on-chain using Solidity smart contracts
- Supporting both local proving and the Succinct Prover Network

## Requirements

- [Rust](https://rustup.rs/)
- [SP1](https://docs.succinct.xyz/docs/sp1/getting-started/install)
- [Foundry](https://getfoundry.sh/) (for smart contract testing)
- Docker (for EVM-compatible proof generation)

## Project Structure

```
├── program/          # SP1 RISC-V program for transaction inclusion verification
├── script/           # Rust scripts for proof generation and testing
├── contracts/        # Solidity smart contracts for on-chain verification
├── lib/              # Shared library for transaction inclusion logic
└── README.md
```

## Quick Start

### 1. Setup Environment

Copy the environment template and configure your private key:

```sh
cp .env.example .env
# Edit .env and set NETWORK_PRIVATE_KEY=0x... (for prover network)
```

### 2. Build the Program

The program is automatically built when running scripts.

### 3. Test Transaction Inclusion (Local)

Execute the program locally without generating proofs:

```sh
cd script
cargo run --release -- --execute
```

### 4. Generate Core Proofs (Local)

Generate SP1 core proofs locally:

```sh
cd script
cargo run --release -- --prove
```

### 5. Generate EVM-Compatible Proofs (Recommended: Network)

Using the **Succinct Prover Network** (recommended - no local resource requirements):

```sh
cd script
cargo run --release --bin evm_prover_network -- --system groth16
```

Or generate PLONK proofs:

```sh
cargo run --release --bin evm_prover_network -- --system plonk
```

**Local Generation** (requires 128GB RAM):

```sh
cd script
cargo run --release --bin evm -- --system groth16 --local
```

### 6. Test Smart Contracts

Run Foundry tests with real proof fixtures:

```sh
cd contracts
forge test
```

Run specific test suites:

```sh
forge test --match-contract TransactionInclusionGroth16Test
```

## Available Commands

### Proof Generation Scripts

| Script | Purpose | Requirements |
|--------|---------|--------------|
| `cargo run --release -- --execute` | Execute program locally | Local |
| `cargo run --release -- --prove` | Generate core proof | Local |
| `cargo run --release --bin evm_prover_network` | Prover network EVM proofs (recommended) | Network key + PROVE tokens |
| `cargo run --release --bin evm --local` | Local EVM proofs | 128GB RAM + Docker |
| `cargo run --release --bin vkey` | Get verification key | Local |

### Utility Scripts

```sh
# Fix fixture encoding (if needed)
cargo run --release --bin fix_fixture

# Get verification key for contracts
cargo run --release --bin vkey
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

## Smart Contract Integration

### Verification Key

Your program's verification key:
```
0x00406e83a33c65281baca239883b661226dcaa5e46ada0c41aab3f22b3e33123
```

### Contract Deployment

Deploy `TransactionInclusionVerifier.sol` with:
- **Verifier**: SP1 Gateway address (see [SP1 Docs](https://docs.succinct.xyz/docs/sp1/verification/contract-addresses))
- **Program VKey**: Use the verification key above

#### Supported Networks

| Network | Groth16 Gateway | PLONK Gateway |
|---------|----------------|---------------|
| Ethereum Mainnet | `0x397A5f7f3dBd538f23DE225B51f532c34448dA9B` | `0x3B6041173B80E77f038f3F2C0f9744f04837185e` |
| Sepolia | `0x397A5f7f3dBd538f23DE225B51f532c34448dA9B` | `0x3B6041173B80E77f038f3F2C0f9744f04837185e` |
| Arbitrum | `0x397A5f7f3dBd538f23DE225B51f532c34448dA9B` | `0x3B6041173B80E77f038f3F2C0f9744f04837185e` |

### Contract Usage

```solidity
// Verify transaction inclusion
(
    bytes32 blockHash,
    uint64 blockNumber,
    bytes32 transactionHash,
    uint64 transactionIndex,
    bool isIncluded,
    bytes32 verifiedAgainstRoot
) = verifier.verifyTransactionInclusion(publicValues, proof);
```

## Configuration

### Transaction Configuration

To verify different transactions, update `INCLUDED_TX` in `lib/src/lib.rs`:

```rust
pub const INCLUDED_TX: &str = "0x9bd463b17765f462c6e24ded54663ab87cc2babca5ac7c94a704273f746b44c7";
```

### Network Configuration

Update RPC URL for different networks:

```sh
cargo run --release --bin evm_prover_network -- --eth-rpc-url https://your-rpc-url --system groth16
```

## Example Output

Successful proof generation will show:

```
✅ Network private key found in environment
Transaction found in block: 23330039, index: 33
🎉 SUCCESS: Trie root MATCHES block transactions root!
✅ Host validation successful - merkle proof is valid!

=== PROOF REQUEST SUBMITTED ===
Proof request submitted to Succinct Prover Network!
Monitor your proof at: https://explorer.succinct.xyz/request/0x...

✅ EVM-compatible proof generated successfully using Succinct Prover Network!

=== EVM PROOF FIXTURE GENERATED ===
Verification Key: 0x00406e83a33c65281baca239883b661226dcaa5e46ada0c41aab3f22b3e33123
Block Hash: 0x7ad3d805da4793feb857ce3476979617b84074c68be96a846d3d5d028611d719
Block Number: 23330039
Transaction Hash: 0x9bd463b17765f462c6e24ded54663ab87cc2babca5ac7c94a704273f746b44c7
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

### Common Issues

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
```

## Resources

- [SP1 Documentation](https://docs.succinct.xyz/)
- [Succinct Prover Network](https://docs.succinct.xyz/docs/sp1/prover-network/quickstart)
- [SP1 Contract Addresses](https://docs.succinct.xyz/docs/sp1/verification/contract-addresses)
- [Succinct Explorer](https://explorer.succinct.xyz)

## License

MIT