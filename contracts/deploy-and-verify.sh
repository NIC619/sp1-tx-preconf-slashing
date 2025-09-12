#!/bin/bash

# Deploy and Verify TransactionInclusionVerifier Contract
# Usage: ./deploy-and-verify.sh <network>
# Example: ./deploy-and-verify.sh sepolia

set -e

NETWORK=${1:-sepolia}

echo "=== TRANSACTION INCLUSION VERIFIER DEPLOYMENT ==="
echo "Network: $NETWORK"
echo "Will deploy and verify on Etherscan automatically"
echo ""

# Load environment variables from .env file
if [ -f ".env" ]; then
    echo "Loading environment variables from .env file..."
    set -a  # automatically export all variables
    source .env
    set +a  # stop automatically exporting
    echo "✅ Environment variables loaded from .env"
else
    echo "⚠️  No .env file found. Please create one based on .env.example"
    echo "Copy .env.example to .env and fill in your values:"
    echo "  cp .env.example .env"
    echo "  nano .env"
    echo ""
    echo "Or set environment variables manually."
fi
echo ""

# Check required environment variables
if [ -z "$SP1_VERIFIER_ADDRESS" ]; then
    echo "Error: SP1_VERIFIER_ADDRESS environment variable is required"
    echo "For Sepolia testnet: export SP1_VERIFIER_ADDRESS=0x397A5f7f3dBd538f23DE225B51f532c34448dA9B"
    exit 1
fi

if [ -z "$TX_INCLUSION_PROGRAM_VKEY" ]; then
    echo "Error: TX_INCLUSION_PROGRAM_VKEY environment variable is required"
    echo "Get this from your latest proof generation output"
    exit 1
fi

if [ -z "$PRIVATE_KEY" ]; then
    echo "Error: PRIVATE_KEY environment variable is required"
    exit 1
fi

if [ -z "$ETHERSCAN_API_KEY" ]; then
    echo "Error: ETHERSCAN_API_KEY environment variable is required for verification"
    exit 1
fi

echo "Environment check passed ✅"
echo "SP1 Verifier: $SP1_VERIFIER_ADDRESS"
echo "Program VKey: $TX_INCLUSION_PROGRAM_VKEY"
echo ""

# Deploy and verify the contract
echo "Deploying and verifying contract..."
forge script script/DeployTransactionInclusionVerifier.s.sol:DeployTransactionInclusionVerifier \
    --rpc-url ${NETWORK} \
    --broadcast \
    --verify \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    -vvvv

# Check if deployment was successful
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    
    # Source the deployment info
    if [ -f "deployment.env" ]; then
        source deployment.env
        echo "Contract deployed at: $TRANSACTION_INCLUSION_VERIFIER"
        
        echo ""
        echo "✅ Contract deployed and verified on Etherscan!"
        
        echo ""
        echo "=== DEPLOYMENT SUMMARY ==="
        echo "Contract Address: $TRANSACTION_INCLUSION_VERIFIER"
        echo "Owner: $OWNER"
        echo "SP1 Verifier: $SP1_VERIFIER"
        echo "Program VKey: $PROGRAM_VKEY"
        echo "Network: $NETWORK"
        echo "Etherscan: https://${NETWORK}.etherscan.io/address/$TRANSACTION_INCLUSION_VERIFIER"
        
    else
        echo "❌ Deployment info file not found"
        exit 1
    fi
else
    echo "❌ Deployment failed"
    exit 1
fi