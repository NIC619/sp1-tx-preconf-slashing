#!/bin/bash

# Deploy and Verify Contracts
# Usage: ./deploy-and-verify.sh <contract> <network>
# Examples: 
#   ./deploy-and-verify.sh verifier sepolia
#   ./deploy-and-verify.sh slasher sepolia

set -e

CONTRACT=${1:-verifier}
NETWORK=${2:-sepolia}

deployment_explorer_host() {
    if [ "$NETWORK" = "mainnet" ]; then
        echo "etherscan.io"
    else
        echo "${NETWORK}.etherscan.io"
    fi
}

network_key() {
    echo "$NETWORK" | tr '[:lower:]' '[:upper:]'
}

source_deployment_env() {
    if [ -f "deployment.env" ]; then
        set -a
        source deployment.env
        set +a
    fi
}

append_slasher_deployment() {
    if [ ! -f "slasher-deployment.tmp" ]; then
        return
    fi

    if [ -f "deployment.env" ]; then
        grep -v -E '^(# TxInclusionPreciseSlasher deployment info|TX_INCLUSION_PRECISE_SLASHER=|SLASHER_OWNER=|WITHDRAWAL_DELAY=|SLASH_AMOUNT=|MIN_BOND_AMOUNT=)' \
            deployment.env > deployment.env.tmp || true
        mv deployment.env.tmp deployment.env
    fi

    {
        echo ""
        echo "# TxInclusionPreciseSlasher deployment info"
        cat slasher-deployment.tmp
    } >> deployment.env
    rm slasher-deployment.tmp
}

update_demo_files() {
    source_deployment_env

    local demo_network
    demo_network=$(network_key)
    local contracts_file="demo/src/contracts.js"
    local demo_readme="demo/README.md"

    if [ ! -f "$contracts_file" ]; then
        echo "Skipping demo address update: $contracts_file not found"
        return
    fi

    DEMO_NETWORK_KEY="$demo_network" \
    DEMO_SLASHER="${TX_INCLUSION_PRECISE_SLASHER:-}" \
    DEMO_VERIFIER="${TRANSACTION_INCLUSION_VERIFIER:-}" \
    perl -0pi -e 'my $n=$ENV{"DEMO_NETWORK_KEY"}; my $s=$ENV{"DEMO_SLASHER"}; my $v=$ENV{"DEMO_VERIFIER"}; s/($n:\s*\{[^}]*?SLASHER:\s*)\x27[^\x27]*\x27/${1}\x27$s\x27/s if $s; s/($n:\s*\{[^}]*?VERIFIER:\s*)\x27[^\x27]*\x27/${1}\x27$v\x27/s if $v;' \
        "$contracts_file"

    if [ -f "$demo_readme" ]; then
        DEMO_NETWORK_KEY="$demo_network" \
        DEMO_SLASHER="${TX_INCLUSION_PRECISE_SLASHER:-}" \
        DEMO_VERIFIER="${TRANSACTION_INCLUSION_VERIFIER:-}" \
        perl -0pi -e 'my $n=$ENV{"DEMO_NETWORK_KEY"}; my $s=$ENV{"DEMO_SLASHER"}; my $v=$ENV{"DEMO_VERIFIER"}; s/($n:\s*\{[^}]*?SLASHER:\s*)\x27[^\x27]*\x27/${1}\x27$s\x27/s if $s; s/($n:\s*\{[^}]*?VERIFIER:\s*)\x27[^\x27]*\x27/${1}\x27$v\x27/s if $v;' \
            "$demo_readme"
    fi

    echo "Updated demo contract addresses for $demo_network"
}

case $CONTRACT in
    verifier)
        CONTRACT_NAME="TransactionInclusionVerifier"
        ;;
    slasher)
        CONTRACT_NAME="TxInclusionPreciseSlasher"
        ;;
    *)
        echo "Error: Invalid contract type '$CONTRACT'"
        echo "Valid options: verifier, slasher"
        echo ""
        echo "Usage: ./deploy-and-verify.sh <contract> <network>"
        echo "Examples:"
        echo "  ./deploy-and-verify.sh verifier sepolia"
        echo "  ./deploy-and-verify.sh slasher sepolia"
        exit 1
        ;;
esac

echo "=== $CONTRACT_NAME DEPLOYMENT ==="
echo "Contract: $CONTRACT_NAME"
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
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo "Error: DEPLOYER_PRIVATE_KEY environment variable is required"
    exit 1
fi

if [ -z "$OWNER_PRIVATE_KEY" ]; then
    echo "Error: OWNER_PRIVATE_KEY environment variable is required"
    exit 1
fi

if [ -z "$ETHERSCAN_API_KEY" ]; then
    echo "Error: ETHERSCAN_API_KEY environment variable is required for verification"
    exit 1
fi

# Contract-specific environment checks
if [ "$CONTRACT" = "verifier" ]; then
    if [ -z "$SP1_VERIFIER_ADDRESS" ]; then
        echo "Error: SP1_VERIFIER_ADDRESS environment variable is required for verifier deployment"
        echo "For Sepolia testnet: export SP1_VERIFIER_ADDRESS=0x397A5f7f3dBd538f23DE225B51f532c34448dA9B"
        exit 1
    fi

    if [ -z "$TX_INCLUSION_PROGRAM_VKEY" ]; then
        echo "Error: TX_INCLUSION_PROGRAM_VKEY environment variable is required for verifier deployment"
        echo "Get this from your latest proof generation output"
        exit 1
    fi

    echo "Environment check passed ✅"
    echo "SP1 Verifier: $SP1_VERIFIER_ADDRESS"
    echo "Program VKey: $TX_INCLUSION_PROGRAM_VKEY"
    echo ""

elif [ "$CONTRACT" = "slasher" ]; then
    # For slasher, we can use the deployed verifier address from deployment.env
    if [ -f "deployment.env" ]; then
        source deployment.env
        if [ -z "$TRANSACTION_INCLUSION_VERIFIER" ]; then
            echo "Error: TRANSACTION_INCLUSION_VERIFIER not found in deployment.env"
            echo "Please deploy the TransactionInclusionVerifier first or set the address manually"
            exit 1
        fi
        echo "Environment check passed ✅"
        echo "Inclusion Verifier: $TRANSACTION_INCLUSION_VERIFIER"
        echo "Withdrawal Delay: 100 seconds (for demo purposes)"
        echo ""
    else
        echo "Error: deployment.env file not found"
        echo "Please deploy the TransactionInclusionVerifier first, or create deployment.env with:"
        echo "TRANSACTION_INCLUSION_VERIFIER=0x..."
        exit 1
    fi
fi

# Deploy and verify the contract
echo "Deploying and verifying contract..."

if [ "$CONTRACT" = "verifier" ]; then
    forge script script/DeployTransactionInclusionVerifier.s.sol:DeployTransactionInclusionVerifier \
        --rpc-url ${NETWORK} \
        --broadcast \
        --verify \
        --etherscan-api-key $ETHERSCAN_API_KEY \
        -vvvv
elif [ "$CONTRACT" = "slasher" ]; then
    forge script script/DeployTxInclusionPreciseSlasher.s.sol:DeployTxInclusionPreciseSlasher \
        --rpc-url ${NETWORK} \
        --broadcast \
        --verify \
        --etherscan-api-key $ETHERSCAN_API_KEY \
        -vvvv
fi

# Check if deployment was successful
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    
    # Source the deployment info
    if [ -f "deployment.env" ]; then
        source_deployment_env
        
        if [ "$CONTRACT" = "verifier" ]; then
            update_demo_files

            echo "Contract deployed at: $TRANSACTION_INCLUSION_VERIFIER"
            
            echo ""
            echo "✅ Contract deployed and verified on Etherscan!"
            
            echo ""
            echo "=== DEPLOYMENT SUMMARY ==="
            echo "Contract: TransactionInclusionVerifier"
            echo "Address: $TRANSACTION_INCLUSION_VERIFIER"
            echo "Owner: $OWNER"
            echo "SP1 Verifier: $SP1_VERIFIER"
            echo "Program VKey: $PROGRAM_VKEY"
            echo "Network: $NETWORK"
            echo "Etherscan: https://$(deployment_explorer_host)/address/$TRANSACTION_INCLUSION_VERIFIER"
            
        elif [ "$CONTRACT" = "slasher" ]; then
            append_slasher_deployment
            source_deployment_env
            update_demo_files
            
            echo "Contract deployed at: $TX_INCLUSION_PRECISE_SLASHER"
            
            echo ""
            echo "✅ Contract deployed and verified on Etherscan!"
            
            echo ""
            echo "=== DEPLOYMENT SUMMARY ==="
            echo "Contract: TxInclusionPreciseSlasher"
            echo "Address: $TX_INCLUSION_PRECISE_SLASHER"
            echo "Owner: $SLASHER_OWNER"
            echo "Inclusion Verifier: $TRANSACTION_INCLUSION_VERIFIER"
            echo "Withdrawal Delay: $WITHDRAWAL_DELAY seconds"
            echo "Slash Amount: $SLASH_AMOUNT wei"
            echo "Min Bond Amount: $MIN_BOND_AMOUNT wei"
            echo "Network: $NETWORK"
            echo "Etherscan: https://$(deployment_explorer_host)/address/$TX_INCLUSION_PRECISE_SLASHER"
        fi
        
    else
        echo "❌ Deployment info file not found"
        exit 1
    fi
else
    echo "❌ Deployment failed"
    exit 1
fi
