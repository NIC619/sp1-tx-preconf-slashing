# Succinct Prover Network Integration Guide

This document provides comprehensive guidance on integrating the Succinct Prover Network with SP1 projects, based on real-world implementation experience.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Setup Process](#setup-process)
4. [Implementation Patterns](#implementation-patterns)
5. [API Reference](#api-reference)
6. [Cost Optimization](#cost-optimization)
7. [Monitoring & Debugging](#monitoring--debugging)
8. [Common Issues & Solutions](#common-issues--solutions)
9. [Best Practices](#best-practices)
10. [Migration from Local Proving](#migration-from-local-proving)

## Overview

The Succinct Prover Network is a managed service that provides GPU-accelerated proof generation for SP1 programs. It eliminates the need for local high-memory machines (128GB+ RAM) and provides professional-grade infrastructure for ZK proof generation.

### Key Benefits

- **No Hardware Requirements**: No need for 128GB+ RAM locally
- **Cost Effective**: Pay-per-proof model with auction-based pricing
- **Scalable**: Professional GPU clusters with optimized performance
- **Reliable**: Enterprise-grade infrastructure with monitoring
- **Fast**: Typically faster than local generation for non-trivial programs

### Supported Proof Types

- **Groth16**: Fastest verification, commonly used for on-chain verification
- **PLONK**: Alternative SNARK system with different trade-offs
- **Compressed**: SP1's native proof format (not EVM-compatible)

## Prerequisites

### 1. PROVE Token Setup

**Acquire PROVE Tokens:**
```bash
# PROVE tokens are required to pay for proof generation
# Available on Ethereum Mainnet
```

**Deposit into Network:**
- Visit the Succinct Network dashboard
- Connect your wallet
- Deposit PROVE tokens into the network

### 2. Private Key Generation

**Using Foundry (Recommended):**
```bash
# Generate a new wallet
cast wallet new

# Output will include:
# - Private key (keep secure!)
# - Address (fund this with PROVE tokens)
```

**Using Metamask:**
- Create new account
- Export private key
- Fund the address with PROVE tokens

### 3. Environment Setup

Create `.env` file:
```env
NETWORK_PRIVATE_KEY=0x1234567890abcdef...
# Optionally specify RPC (defaults to Succinct's RPC)
# SP1_RPC_URL=https://rpc.mainnet.succinct.xyz
```

## Setup Process

### 1. Update Dependencies

**Cargo.toml Configuration:**
```toml
[dependencies]
sp1-sdk = { version = "5.2.1", default-features = false, features = ["network"] }

[[bin]]
name = "evm_prover_network"
path = "src/bin/evm_prover_network.rs"
```

**Key Points:**
- `default-features = false`: Disables local proving dependencies
- `features = ["network"]`: Enables network client functionality
- SP1 version must be >= 5.2.1 for network support

### 2. Environment Loading

**Basic Setup:**
```rust
#[tokio::main]
async fn main() -> Result<()> {
    // Load environment variables
    dotenv::dotenv().ok();
    sp1_sdk::utils::setup_logger();
    
    // Verify network key exists
    if std::env::var("NETWORK_PRIVATE_KEY").is_err() {
        eprintln!("Error: NETWORK_PRIVATE_KEY required for network mode");
        std::process::exit(1);
    }
    
    // ... rest of implementation
}
```

### 3. Client Creation

**Network Client:**
```rust
use sp1_sdk::{ProverClient, Prover};

// Create network-enabled client
let client = ProverClient::builder().network().build();

// Setup program (same as local)
let (pk, vk) = client.setup(ELF);
```

**Advanced Configuration:**
```rust
// Custom configuration
let client = ProverClient::builder()
    .network()
    .private_key("0x...")  // Override env variable
    .rpc_url("https://custom-rpc.example.com")
    .build();
```

## Implementation Patterns

### 1. Basic Proof Generation

**Groth16 (Recommended for EVM):**
```rust
let proof = client.prove(&pk, &stdin)
    .groth16()
    .strategy(FulfillmentStrategy::Auction)
    .run_async()
    .await?;
```

**PLONK Alternative:**
```rust
let proof = client.prove(&pk, &stdin)
    .plonk()
    .strategy(FulfillmentStrategy::Auction)
    .run_async()
    .await?;
```

### 2. Advanced Configuration

**With Custom Parameters:**
```rust
use std::time::Duration;

let proof = client.prove(&pk, &stdin)
    .groth16()
    .strategy(FulfillmentStrategy::Auction)
    .max_price_per_pgu(1_000_000_000_000u64)  // 1 PROVE per billion PGU
    .min_auction_period(Duration::from_secs(15))
    .timeout(Duration::from_secs(1200))  // 20 minutes for Groth16
    .run_async()
    .await?;
```

**Skip Simulation (Advanced):**
```rust
// Only use if you're certain about gas requirements
let proof = client.prove(&pk, &stdin)
    .groth16()
    .strategy(FulfillmentStrategy::Auction)
    .skip_simulation(true)
    .gas_limit(50_000_000_000)  // Set explicit gas limit
    .run_async()
    .await?;
```

### 3. Error Handling

**Robust Error Management:**
```rust
let proof = match client.prove(&pk, &stdin)
    .groth16()
    .strategy(FulfillmentStrategy::Auction)
    .run_async()
    .await
{
    Ok(proof) => proof,
    Err(e) => {
        eprintln!("Proof generation failed: {}", e);
        // Check common issues:
        // - Insufficient PROVE tokens
        // - Network connectivity
        // - Program registration issues
        return Err(eyre::eyre!("Network proof failed: {}", e));
    }
};
```

### 4. Async Request Pattern

**Submit and Wait:**
```rust
// Submit proof request
let request_id = client.prove(&pk, &stdin)
    .groth16()
    .strategy(FulfillmentStrategy::Auction)
    .request_async()
    .await?;

println!("Proof request submitted: {}", request_id);
println!("Monitor at: https://explorer.mainnet.succinct.xyz/request/{}", request_id);

// Wait for completion
let proof = client.wait_proof(
    request_id,
    Some(Duration::from_secs(3600)),  // Max wait time
    Some(Duration::from_secs(900))    // Check interval
).await?;
```

## API Reference

### FulfillmentStrategy

```rust
pub enum FulfillmentStrategy {
    Auction,    // Recommended: Market-based pricing
    Reserved,   // For reserved capacity (enterprise)
}
```

### ProveBuilder Methods

| Method | Description | Default | Notes |
|--------|-------------|---------|-------|
| `.groth16()` | Use Groth16 proof system | - | Recommended for EVM |
| `.plonk()` | Use PLONK proof system | - | Alternative to Groth16 |
| `.strategy()` | Set fulfillment strategy | Auction | Usually use Auction |
| `.timeout()` | Set request timeout | 300s | Groth16: 1200s, PLONK: 1800s |
| `.max_price_per_pgu()` | Set max price per PGU | 2 PROVE | Market rate limit |
| `.min_auction_period()` | Minimum auction time | 1s | Allow time for bids |
| `.skip_simulation()` | Skip local simulation | false | Use with caution |
| `.gas_limit()` | Set explicit gas limit | auto | Required with skip_simulation |
| `.run_async()` | Generate proof | - | Returns proof directly |
| `.request_async()` | Submit request only | - | Returns request ID |

### Client Builder

```rust
ProverClient::builder()
    .network()                    // Enable network mode
    .private_key("0x...")        // Set private key (optional)
    .rpc_url("https://...")      // Set custom RPC (optional)
    .build()                     // Create client
```

## Cost Optimization

### Understanding Pricing

**Cost Components:**
- **Base Fee**: Fixed cost per proof (~0.3 PROVE)
- **PGU Cost**: Variable based on program complexity
- **Market Rate**: Auction-based pricing for PGUs

**Proof Type Comparison:**
```
Groth16: Generally faster generation, same verification cost
PLONK:   Alternative system, may have different resource requirements
```

### Optimization Strategies

**1. Program Optimization:**
```rust
// Reduce cycles in your SP1 program
// Minimize complex operations in the circuit
// Use efficient data structures
```

**2. Auction Parameters:**
```rust
.min_auction_period(Duration::from_secs(15))  // Allow competitive bidding
.max_price_per_pgu(reasonable_limit)          // Set cost controls
```

**3. Proof System Selection:**
```rust
// Groth16 often faster for similar complexity
.groth16()  // vs .plonk()
```

**4. Batch Operations:**
```rust
// If generating multiple proofs, consider batching inputs
// More efficient than many small proofs
```

## Monitoring & Debugging

### Request Tracking

**Explorer Integration:**
```rust
println!("Monitor at: https://explorer.mainnet.succinct.xyz/request/{}", request_id);
```

**Log Analysis:**
```bash
# Enable verbose logging
RUST_LOG=info cargo run --release --bin evm_prover_network
```

**Key Log Information:**
- Program registration status
- PGU estimates and gas limits
- Auction parameters and pricing
- Request ID for tracking
- Proof generation progress

### Common Status Messages

```
✅ "Registered program 0x..."     - Program successfully registered
ℹ️  "Requesting proof: Strategy: Auction" - Proof request submitted
ℹ️  "Created request 0x... in transaction 0x..." - Request created on-chain
ℹ️  "Proof request assigned, proving..." - Prover assigned
✅ "Proof generated successfully" - Completion
```

## Common Issues & Solutions

### 1. Insufficient Funds

**Error:** `Insufficient balance` or `Account not funded`

**Solution:**
```bash
# Check balance on Succinct Explorer
# Deposit more PROVE tokens to your address
```

### 2. Invalid Private Key

**Error:** `Invalid private key format`

**Solution:**
```env
# Ensure format: 0x + 64 hex characters
NETWORK_PRIVATE_KEY=0x1234567890abcdef...
```

### 3. Network Connectivity

**Error:** `Failed to connect` or `RPC error`

**Solutions:**
```bash
# Check internet connection
# Verify RPC endpoint
# Try alternative RPC if custom one specified
```

### 4. Program Registration Failures

**Error:** `Failed to register program`

**Solutions:**
```bash
# Rebuild project
cargo clean && cargo build --release

# Verify ELF binary is valid
# Check SP1 version compatibility
```

### 5. Proof Generation Timeout

**Error:** `Request timed out`

**Solutions:**
```rust
// Increase timeout for complex programs
.timeout(Duration::from_secs(1800))  // 30 minutes

// Check program complexity (PGU count)
// Consider program optimization
```

### 6. High Costs

**Issue:** Unexpected high PROVE token usage

**Solutions:**
```rust
// Set price limits
.max_price_per_pgu(1_000_000_000_000u64)  // 1 PROVE per billion PGU

// Optimize program to reduce cycles
// Check PGU estimates in logs
```

## Best Practices

### 1. Development Workflow

```bash
# 1. Test locally first (execute mode)
cargo run --release -- --execute

# 2. Generate core proof (faster iteration)
cargo run --release -- --prove  

# 3. Generate network EVM proof (final step)
cargo run --release --bin evm_prover_network -- --system groth16
```

### 2. Environment Management

```bash
# Use different .env files for different environments
.env.development   # Testnet/development keys
.env.production    # Production keys

# Load appropriate environment
source .env.production
```

### 3. Cost Management

```rust
// Set reasonable limits
.max_price_per_pgu(2_000_000_000_000u64)  // 2 PROVE per billion PGU
.timeout(Duration::from_secs(1200))       // Reasonable timeout

// Monitor costs in Explorer
// Set up alerts for unusual spending
```

### 4. Error Recovery

```rust
// Implement retry logic for transient failures
for attempt in 1..=3 {
    match generate_proof().await {
        Ok(proof) => return Ok(proof),
        Err(e) if attempt < 3 => {
            println!("Attempt {} failed: {}, retrying...", attempt, e);
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
        Err(e) => return Err(e),
    }
}
```

### 5. Logging & Monitoring

```rust
use tracing::{info, error, warn};

info!("Submitting proof request for program {}", program_id);
warn!("High PGU count detected: {} (expected < 1M)", pgu_count);
error!("Proof generation failed after {} attempts", max_attempts);
```

## Migration from Local Proving

### 1. Dependency Changes

**Before (Local):**
```toml
sp1-sdk = "5.2.1"
```

**After (Network):**
```toml
sp1-sdk = { version = "5.2.1", default-features = false, features = ["network"] }
```

### 2. Client Creation Changes

**Before (Local):**
```rust
let client = ProverClient::from_env();
```

**After (Network):**
```rust
let client = ProverClient::builder().network().build();
```

### 3. Proof Generation Changes

**Before (Local):**
```rust
let proof = client.prove(&pk, &stdin)
    .groth16()
    .run()?;
```

**After (Network):**
```rust
let proof = client.prove(&pk, &stdin)
    .groth16()
    .strategy(FulfillmentStrategy::Auction)
    .run_async()
    .await?;
```

### 4. Hybrid Approach

```rust
// Support both local and network
let client = if args.use_network {
    ProverClient::builder().network().build()
} else {
    ProverClient::from_env()
};

// Different proof generation paths
let proof = if args.use_network {
    client.prove(&pk, &stdin)
        .groth16()
        .strategy(FulfillmentStrategy::Auction)
        .run_async()
        .await?
} else {
    client.prove(&pk, &stdin)
        .groth16()
        .run()?
};
```

## Performance Expectations

### Typical Generation Times

| Program Complexity | Groth16 | PLONK | Notes |
|-------------------|---------|-------|-------|
| Simple (< 100K cycles) | 30-60s | 60-120s | Fixed overhead dominates |
| Medium (100K-1M cycles) | 1-3 min | 2-5 min | Network efficiency shows |
| Large (1M-10M cycles) | 5-15 min | 10-30 min | Significant speedup vs local |
| Very Large (10M+ cycles) | 15-60 min | 30-120 min | Professional hardware advantage |

### Resource Usage

**Network Benefits:**
- Zero local RAM usage
- No local GPU requirements
- No Docker or build complexity
- Consistent performance regardless of local hardware

**Network Costs:**
- PROVE token costs (typically $1-50 per proof depending on complexity)
- Network latency (vs immediate local generation)
- Dependency on external service

## Conclusion

The Succinct Prover Network provides a robust, scalable solution for ZK proof generation without local hardware requirements. Key success factors:

1. **Proper Setup**: Ensure PROVE tokens and private key configuration
2. **Reasonable Parameters**: Set appropriate timeouts and price limits
3. **Error Handling**: Implement robust error recovery and monitoring
4. **Cost Management**: Monitor usage and optimize program complexity
5. **Development Workflow**: Test locally first, then generate network proofs

For production use cases or complex programs, the network often provides better performance and reliability than local generation, making it the recommended approach for most SP1 applications.

## Resources

- [Succinct Prover Network Docs](https://docs.succinct.xyz/docs/sp1/prover-network/quickstart)
- [SP1 SDK Documentation](https://docs.succinct.xyz/docs/sp1/writing-programs/setup)
- [Succinct Explorer](https://explorer.mainnet.succinct.xyz)
- [Network Status](https://status.succinct.xyz)
- [Support Channel](https://t.me/+AzG4ws-kD24yMGYx)