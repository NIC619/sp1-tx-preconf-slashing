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
3. **Check Inclusion**: Query Ethereum mainnet to verify transaction inclusion at promised positions
4. **Slash Detection**: Identify commitment violations and prepare for slashing

## Architecture

### Networks
- **Proposer Operations**: Executed on the network where slasher contract is deployed (Sepolia for testing)
- **Commitment Verification**: Always references Ethereum mainnet transactions
- **Block Queries**: Uses Ethereum mainnet RPC for transaction inclusion verification

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

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm start
```

The application will be available at `http://localhost:3000`

### Configuration

Update contract addresses in `src/contracts.js`:

```javascript
export const CONTRACTS = {
  SEPOLIA: {
    SLASHER: '0x1cF3c7F4bA3720Dd7a05058725Ab3846309B6DC4',
    VERIFIER: '0x5493090647159c35579AE984032D612166C6357F',
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
   - Fill in block number, transaction hash, and index
   - Set commitment deadline
   - Generate EIP-712 signature (in production, proposer would sign)

2. **Verify Commitment**:
   - Paste commitment JSON and signature
   - Verify proposer's signature authenticity
   - Validate commitment parameters

3. **Check Inclusion**:
   - Query Ethereum mainnet for actual transaction at specified position
   - Compare with promised transaction hash
   - Detect commitment violations

4. **Slash Proposer** (if violation detected):
   - Evidence of broken commitment is displayed
   - Slashing mechanism integration (requires ZK proof generation)

## Technical Details

### EIP-712 Structure
```javascript
{
  blockNumber: uint64,
  transactionHash: bytes32, 
  transactionIndex: uint64,
  deadline: uint256
}
```

### Contract Integration
- **Bond Management**: Direct smart contract calls via ethers.js
- **Signature Verification**: Client-side EIP-712 validation
- **Transaction Queries**: Ethereum RPC calls to verify inclusion

### Network Handling
- **Slasher Operations**: Current network (Sepolia for testing)
- **Commitment Data**: Always Ethereum mainnet
- **EIP-712 Signatures**: Use the network chainId where proposer is connected (e.g., Sepolia)
- **RPC Endpoints**: 
  - Mainnet: `https://ethereum-rpc.publicnode.com`
  - Sepolia: `https://ethereum-sepolia-rpc.publicnode.com`

**⚠️ Important Caveat**: In this demo, commitments reference mainnet transactions but proposers sign with their connected network's chainId (e.g., Sepolia). This means:
- Commitment data includes mainnet block numbers and transaction hashes
- EIP-712 signatures include Sepolia's chainId (11155111) in the domain separator
- Signature verification must use the same chainId as signing (Sepolia)
- This is a demo-specific implementation - production deployments should align chainIds

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
- Cross-network signing: commitments reference mainnet but signatures use Sepolia chainId

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