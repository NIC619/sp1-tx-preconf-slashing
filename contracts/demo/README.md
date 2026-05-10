# TxInclusionPreciseSlasher Demo

A React-based web application demonstrating the complete flow of the TxInclusionPreciseSlasher system, including preconfirmation requests, EIP-712 signature verification, and slashing for commitment violations.

## Features

### Proposer Tab
- **Bond Management**: Add bonds (minimum 0.1 ETH) to the slasher contract
- **Withdrawal System**: Initiate and complete bond withdrawals with time delays
- **Real-time Status**: View current bond amounts, pending withdrawals, and contract parameters
- **MetaMask Integration**: Direct interaction with deployed slasher contracts

### User Tab
1. **Request Preconfirmation**: Create structured commitment requests with EIP-712 signatures
2. **Verify Commitments**: Validate the authenticity of proposer signatures
3. **Check Inclusion**: Query the connected network to verify transaction inclusion at promised positions
4. **Slash Detection**: Identify commitment violations and prepare for slashing

## Architecture

### Networks
- **Proposer Operations**: Executed on the network where slasher contract is deployed (Sepolia for testing)
- **Commitment Verification**: References transactions on the connected wallet network
- **Block Queries**: Uses the connected wallet network for transaction inclusion verification

### Key Components
- **Wallet Integration**: MetaMask connection with network switching
- **EIP-712 Signing**: Structured data signing for secure commitments  
- **Smart Contract Integration**: Direct interaction with deployed slasher contracts
- **Ethereum RPC**: Real-time blockchain data queries

## Setup

### Prerequisites
- Node.js 16+
- MetaMask browser extension
- Access to Sepolia testnet ETH (for testing)
- `PROPOSER_PRIVATE_KEY` in the repository root `.env` for backend proposer signing and bond operations

### Installation

```bash
# Install frontend dependencies
npm install

# Start development server
npm start
```

The application will be available at `http://localhost:3000`

Start the backend in a separate terminal:

```bash
cd backend
npm install
npm start
```

The backend reads `PROPOSER_PRIVATE_KEY` and `NETWORK_PRIVATE_KEY` from the repository root `.env` file.

### Configuration

The deployment script updates contract addresses in `src/contracts.js` and this README after successful deployments:

```bash
cd ..
./deploy-and-verify.sh verifier sepolia
./deploy-and-verify.sh slasher sepolia
```

The resulting Sepolia configuration is:

```javascript
export const CONTRACTS = {
  SEPOLIA: {
    SLASHER: '0xc64E87577AC79EA47CBd372784D48C904bc07ad6',
    VERIFIER: '0x7e6f831D387Ba9141513711b914bcFC306e853b8',
  },
  MAINNET: {
    SLASHER: '', // Deploy when ready
    VERIFIER: '', // Deploy when ready
  }
};
```

## Usage Flow

### For Proposers

1. **Connect Wallet**: Connect MetaMask and switch to Sepolia network
2. **Add Bond**: Deposit minimum 0.1 ETH to participate in preconfirmations
3. **Monitor Status**: Track bond amounts and withdrawal timeframes
4. **Withdraw Funds**: Initiate withdrawal with 1-day delay, then complete

### For Users

1. **Request Preconfirmation**: 
   - Load a recent finalized block from the connected network
   - Choose whether the proposer should sign a fulfilled commitment, a different-transaction violation, or a no-transaction-at-position violation
   - Request an EIP-712 signature from the backend proposer configured with `PROPOSER_PRIVATE_KEY`

2. **Verify Commitment**:
   - Paste commitment JSON and signature
   - Verify proposer's signature authenticity
   - Validate commitment parameters

3. **Check Inclusion**:
   - Query the connected network for actual transaction at specified position
   - Compare with promised transaction hash
   - Detect commitment violations

4. **Slash Proposer** (if violation detected):
   - Evidence of broken commitment is displayed
   - Generate a ZK proof
   - Ask the contract owner to register the canonical block metadata
   - Execute the slashing transaction

### Register Canonical Block Metadata

The slasher requires the owner to register the canonical block hash and timestamp for the committed block before a slash
can succeed:

```bash
cd ../
BLOCK_NUMBER=23354683 \
BLOCK_HASH=0x... \
BLOCK_TIMESTAMP=1757890000 \
forge script script/RegisterCanonicalBlock.s.sol:RegisterCanonicalBlock \
  --rpc-url sepolia \
  --broadcast
```

## Technical Details

### EIP-712 Structure

The demo signs an exact-position inclusion promise:
`txHashAt(blockNumber, transactionIndex) == transactionHash`. The UI may detect several user-facing failure reasons,
but the contract only slashes exact-position violations: a different transaction at that index or no transaction at that
index.

The canonical block timestamp is registered by the demo owner alongside the canonical block hash. The slasher accepts
valid slash proofs for a fixed 1-day slashing window after that timestamp.

```javascript
{
  blockNumber: uint64,
  transactionHash: bytes32, 
  transactionIndex: uint64
}
```

### Contract Integration
- **Bond Management**: Direct smart contract calls via ethers.js
- **Signature Verification**: Client-side EIP-712 validation
- **Transaction Queries**: Ethereum RPC calls to verify inclusion

### Network Handling
- **Slasher Operations**: Current network (Sepolia for testing)
- **Commitment Data**: Connected wallet network
- **EIP-712 Signatures**: Use the network chainId where proposer is connected (e.g., Sepolia)
- **RPC Endpoints**: 
  - Mainnet: `https://ethereum-rpc.publicnode.com`
  - Sepolia: `https://ethereum-sepolia-rpc.publicnode.com`

**Important Caveat**: In this demo, the backend proposer signs commitments with `PROPOSER_PRIVATE_KEY` for the connected network. This means:
- Commitment data includes block numbers and transaction hashes from the connected network
- EIP-712 signatures include the connected chainId in the domain separator
- Signature verification must use the same chainId as signing (Sepolia)
- This is a demo-specific implementation - production deployments should align chainIds
- The signature does not prove the signer was the canonical proposer/builder for the referenced block

## Development

### Key Files
- `src/App.js`: Main application with tab navigation
- `src/components/ProposerTab.js`: Bond management interface
- `src/components/UserTab.js`: Preconfirmation and verification interface
- `src/hooks/useWallet.js`: MetaMask integration
- `src/utils/eip712.js`: EIP-712 signature utilities
- `src/utils/ethereum.js`: Blockchain query utilities
- `src/contracts.js`: Contract addresses and ABIs

### Building for Production

```bash
npm run build
```

Creates optimized build in `build/` directory suitable for deployment.

## Limitations & Future Work

### Current Demo Limitations
- Proposer signature simulation (real proposers would sign independently)
- Slashing requires manual ZK proof generation
- Limited to basic contract interactions
- Demo proposer key is configured in the backend environment

### Production Enhancements
- Automated ZK proof generation for slashing
- Proposer-specific signing interfaces
- Advanced commitment management
- Multi-network deployment coordination
- Real-time monitoring and alerting

## Security Considerations

- Private keys never leave MetaMask
- All signatures verified client-side
- Contract interactions through established libraries
- Network validation before transactions
- Input validation for all user data

## Support

For issues or questions:
1. Check contract deployment status in `deployment.env`
2. Verify network configuration in MetaMask
3. Ensure sufficient funds for gas fees
4. Review browser console for detailed error messages
