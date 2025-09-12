# TransactionInclusionVerifier Deployment

This directory contains scripts to deploy and verify the `TransactionInclusionVerifier` contract.

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
# SP1 Verifier address (varies by network)
SP1_VERIFIER_ADDRESS=0x397A5f7f3dBd538f23DE225B51f532c34448dA9B

# Your program's verification key (get from latest proof generation)
TX_INCLUSION_PROGRAM_VKEY=0x00c88cfee30cdc47103e28f414f4546bf7f4675ec944d46ec7b4eb4b3300f306

# Deployment private key
PRIVATE_KEY=0x...

# Etherscan API key (for verification)
ETHERSCAN_API_KEY=your_api_key_here
```

**⚠️ Security Note**: Never commit your `.env` file to version control. The `.env` file is already included in `.gitignore` to prevent accidental commits.

## SP1 Verifier Addresses

- **Sepolia**: `0x397A5f7f3dBd538f23DE225B51f532c34448dA9B`
- **Ethereum Mainnet**: Check [SP1 Contracts Repository](https://github.com/succinctlabs/sp1-contracts/tree/main/contracts/deployments)

## Getting Your Program VKey

Your program's verification key is output when you generate proofs. Look for lines like:

```
Verification Key: 0x00c88cfee30cdc47103e28f414f4546bf7f4675ec944d46ec7b4eb4b3300f306
```

## Deployment

### Automated Script (Recommended)

```bash
# Deploy and verify on Etherscan (default: Sepolia)
./deploy-and-verify.sh

# Deploy to a specific network
./deploy-and-verify.sh sepolia
./deploy-and-verify.sh mainnet
```

### Manual Foundry Commands

```bash
# Deploy and verify
forge script script/DeployTransactionInclusionVerifier.s.sol:DeployTransactionInclusionVerifier \
    --rpc-url sepolia \
    --broadcast \
    --verify \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    -vvvv
```

## After Deployment

The deployment will create a `deployment.env` file with the contract details:

```bash
TRANSACTION_INCLUSION_VERIFIER=0x...
OWNER=0x...
SP1_VERIFIER=0x...
PROGRAM_VKEY=0x...
```

## Contract Features

- **Owner Control**: The deployer becomes the owner and can update the verification key
- **SP1 Integration**: Uses SP1 verifier for ZK proof verification
- **Event Logging**: Emits events for proof verifications and key updates
- **View Functions**: Includes both state-changing and view-only verification functions

## Usage After Deployment

```solidity
// Update verification key (owner only)
contract.updateVerificationKey(newVKey);

// Verify a proof
(blockHash, blockNumber, txHash, txIndex, isIncluded, root) = 
    contract.verifyTransactionInclusion(publicValues, proofBytes);
```

## Troubleshooting

1. **Verification Fails**: Make sure constructor args are properly encoded
2. **Deployment Fails**: Check gas limits and network configuration
3. **Permission Denied**: Make sure the deployment script is executable (`chmod +x`)
4. **Wrong Network**: Verify you're using the correct RPC URL and verifier address