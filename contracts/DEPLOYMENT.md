# Smart Contract Deployment Guide

This directory contains scripts to deploy and verify both `TransactionInclusionVerifier` and `TxInclusionPreciseSlasher` contracts.

## Available Contracts

1. **TransactionInclusionVerifier** - Verifies ZK proofs for transaction inclusion
2. **TxInclusionPreciseSlasher** - Slashing contract for preconfirmation violations

## Prerequisites

1. **Foundry** - Make sure you have Foundry installed
2. **Environment Variables** - Set up the required environment variables
3. **Network Configuration** - Configure your network in `foundry.toml`

## Setup Environment Variables

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Then edit `.env` with your values:

```bash
# Required for all deployments
PRIVATE_KEY=0x...
ETHERSCAN_API_KEY=your_api_key_here

# Required for TransactionInclusionVerifier deployment
SP1_VERIFIER_ADDRESS=0x397A5f7f3dBd538f23DE225B51f532c34448dA9B
TX_INCLUSION_PROGRAM_VKEY=0x00a1bde4932d9b0fdf65b292dba44b3b23131b5d925592a06fe17735e3d49769
```

**⚠️ Security Note**: Never commit your `.env` file to version control. The `.env` file is already included in `.gitignore` to prevent accidental commits.

## SP1 Verifier Addresses

- **Sepolia**: `0x397A5f7f3dBd538f23DE225B51f532c34448dA9B`
- **Ethereum Mainnet**: Check [SP1 Contracts Repository](https://github.com/succinctlabs/sp1-contracts/tree/main/contracts/deployments)

## Getting Your Program VKey

Your program's verification key is output when you generate proofs. Look for lines like:

```
Verification Key: 0x00a1bde4932d9b0fdf65b292dba44b3b23131b5d925592a06fe17735e3d49769
```

## Deployment

### Step 1: Deploy TransactionInclusionVerifier

Deploy the verifier contract first (required for slasher):

```bash
# Automated deployment and verification
./deploy-and-verify.sh verifier sepolia
./deploy-and-verify.sh verifier mainnet

# Manual deployment
forge script script/DeployTransactionInclusionVerifier.s.sol:DeployTransactionInclusionVerifier \
    --rpc-url sepolia \
    --broadcast \
    --verify \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    -vvvv
```

### Step 2: Deploy TxInclusionPreciseSlasher (Optional)

Deploy the slasher contract after the verifier:

```bash
# Automated deployment and verification
./deploy-and-verify.sh slasher sepolia
./deploy-and-verify.sh slasher mainnet

# Manual deployment
forge script script/DeployTxInclusionPreciseSlasher.s.sol:DeployTxInclusionPreciseSlasher \
    --rpc-url sepolia \
    --broadcast \
    --verify \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    -vvvv
```

### Usage Examples

```bash
# Deploy both contracts on Sepolia
./deploy-and-verify.sh verifier sepolia
./deploy-and-verify.sh slasher sepolia

# Deploy only verifier on mainnet
./deploy-and-verify.sh verifier mainnet
```

## After Deployment

The deployment will create/update a `deployment.env` file with the contract details:

```bash
# TransactionInclusionVerifier deployment info
TRANSACTION_INCLUSION_VERIFIER=0x...
OWNER=0x...
SP1_VERIFIER=0x...
PROGRAM_VKEY=0x...

# TxInclusionPreciseSlasher deployment info
TX_INCLUSION_PRECISE_SLASHER=0x...
WITHDRAWAL_DELAY=86400
SLASH_AMOUNT=100000000000000000
MIN_BOND_AMOUNT=100000000000000000
```

## Contract Features

### TransactionInclusionVerifier
- **Owner Control**: The deployer becomes the owner and can update the verification key
- **SP1 Integration**: Uses SP1 verifier for ZK proof verification
- **Event Logging**: Emits events for proof verifications and key updates
- **View Functions**: Includes both state-changing and view-only verification functions

### TxInclusionPreciseSlasher
- **Bond Management**: Proposers deposit 0.1 ETH minimum bonds
- **Withdrawal Delay**: 1-day delay for bond withdrawals
- **EIP-712 Signatures**: Secure commitment signing for inclusion promises
- **Slashing**: 0.1 ETH penalty with 100% burn for violations
- **Proof Integration**: Uses TransactionInclusionVerifier for proof validation

## Usage After Deployment

### TransactionInclusionVerifier

```solidity
// Update verification key (owner only)
verifier.updateVerificationKey(newVKey);

// Verify a proof
(blockHash, blockNumber, txHash, txIndex, isIncluded, root) = 
    verifier.verifyTransactionInclusion(publicValues, proofBytes);
```

### TxInclusionPreciseSlasher

```solidity
// Proposer adds bond
slasher.addBond{value: 0.1 ether}();

// Proposer initiates withdrawal
slasher.initiateWithdrawal(0.1 ether);

// Complete withdrawal after delay
slasher.completeWithdrawal();

// User slashes proposer for broken commitment
slasher.slash(commitment, proposer, v, r, s, publicValues, proofBytes);
```

## Troubleshooting

### General Issues
1. **Verification Fails**: Make sure constructor args are properly encoded
2. **Deployment Fails**: Check gas limits and network configuration
3. **Permission Denied**: Make sure the deployment script is executable (`chmod +x deploy-and-verify.sh`)
4. **Wrong Network**: Verify you're using the correct RPC URL and verifier address

### Verifier Deployment Issues
5. **SP1 Verifier Address**: Ensure you're using the correct SP1 verifier address for your network
6. **Program VKey**: Get the latest verification key from your proof generation output

### Slasher Deployment Issues
7. **Missing Verifier**: Ensure TransactionInclusionVerifier is deployed first
8. **deployment.env**: Check that `TRANSACTION_INCLUSION_VERIFIER` exists in deployment.env
9. **Hardcoded Address**: If needed, update the hardcoded verifier address in the deployment script

### Script Usage
```bash
# Make script executable
chmod +x deploy-and-verify.sh

# View help
./deploy-and-verify.sh

# Invalid contract type will show usage
./deploy-and-verify.sh invalid
```