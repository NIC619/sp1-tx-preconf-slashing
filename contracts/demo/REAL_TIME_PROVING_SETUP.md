# Real-Time Proof Generation Setup

This guide explains how to enable real-time proof generation using the Succinct Prover Network in your transaction inclusion demo.

## Architecture Overview

```
React UI (Frontend) → Node.js Backend → Rust Binary → Succinct Network
```

The system works as follows:
1. **React UI**: User interface for requesting proofs
2. **Node.js Backend**: API service that orchestrates proof generation
3. **Rust Binary**: Your existing `evm_prover_network` binary
4. **Succinct Network**: The actual proof generation service

## Prerequisites

### 1. Succinct Network Setup

1. **Get PROVE tokens**:
   - Acquire PROVE tokens on Ethereum Mainnet
   - Visit the [Succinct Network dashboard](https://platform.succinct.xyz)

2. **Create a wallet for the network**:
   ```bash
   # Generate a new wallet using cast
   cast wallet new
   
   # Fund the generated address with PROVE tokens
   # Copy the private key for the next step
   ```

3. **Set up environment variables**:
   ```bash
   # In the script directory
   cd ../script
   
   # Create .env file with your network private key
   echo "NETWORK_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE" > .env
   ```

### 2. Build the Rust Binary

```bash
# Build the Rust proof generator
cd ../script
cargo build --release --bin evm_prover_network

# Verify the binary exists
ls -la target/release/evm_prover_network
```

### 3. Setup Backend Service

```bash
# Install backend dependencies
cd demo/backend
npm install

# Create backend .env file (optional, for custom configuration)
echo "PORT=3001" > .env
echo "NETWORK_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE" >> .env
```

### 4. Configure Frontend

```bash
# In demo directory
cd ..
echo "REACT_APP_BACKEND_URL=http://localhost:3001" >> .env
```

## Running the System

### Option 1: Start Everything Separately

**Terminal 1 - Backend Service:**
```bash
cd demo/backend
npm start
# Backend will be available at http://localhost:3001
```

**Terminal 2 - Frontend:**
```bash
cd demo
npm start
# Frontend will be available at http://localhost:3000
```

### Option 2: Integrated Script

Create a startup script `start-realtime.sh`:

```bash
#!/bin/bash

echo "Starting real-time proof generation system..."

# Check if Rust binary exists
if [ ! -f "../script/target/release/evm_prover_network" ]; then
    echo "Building Rust binary..."
    cd ../script && cargo build --release --bin evm_prover_network && cd -
fi

# Start backend in background
echo "Starting backend service..."
cd backend && npm start &
BACKEND_PID=$!
cd ..

# Wait for backend to be ready
sleep 3

# Start frontend
echo "Starting frontend..."
npm start &
FRONTEND_PID=$!

# Trap to kill both processes when script is terminated
trap "kill $BACKEND_PID $FRONTEND_PID" EXIT

wait
```

## Usage

### 1. Verify Configuration

Visit `http://localhost:3000` and check the browser console for:
```
✅ Real-time proving available: true
```

### 2. Generate Proofs

1. **Use the existing fixture scenario**:
   - Block: 23330039
   - Transaction Index: 33
   - Use a different transaction hash to trigger slashing
   - This will use the real proof fixture

2. **Generate new proofs**:
   - Use any other block/transaction combination
   - The system will attempt real-time proof generation using Succinct network
   - The backend automatically passes the transaction hash to the Rust binary
   - No more fallback to mock proofs - only real proofs are generated

### 3. Monitor Proof Generation

- **Backend logs**: Check Terminal 1 for Rust execution logs
- **Frontend logs**: Check browser console for proof generation status
- **Succinct Network**: Monitor requests at https://explorer.mainnet.succinct.xyz

## Configuration Options

### Environment Variables

**Backend (.env in demo/backend/):**
```env
PORT=3001                                    # Backend port
NETWORK_PRIVATE_KEY=0x...                   # Succinct network private key
SP1_RPC_URL=https://rpc.mainnet.succinct.xyz # Optional: custom RPC
RUST_LOG=info                               # Rust logging level
```

**Frontend (.env in demo/):**
```env
REACT_APP_BACKEND_URL=http://localhost:3001  # Backend URL
```

### Proof Generation Settings

Modify `demo/backend/server.js` to customize:

```javascript
// In the /api/generate-proof endpoint
const args = [
  '--system', proofSystem,           // 'groth16' or 'plonk'
  '--eth-rpc-url', 'https://...',    // Ethereum RPC URL
];
```

## Troubleshooting

### Common Issues

**1. "Backend service is not properly configured"**
- Ensure `NETWORK_PRIVATE_KEY` is set in the script/.env file
- Verify the Rust binary exists and is executable
- Check that you have sufficient PROVE tokens

**2. "Rust process failed with code 1"**
- Check backend terminal for detailed Rust logs
- Verify network connectivity to Succinct
- Ensure the transaction exists on mainnet

**3. "Real-time proof generation failed, falling back to mock"**
- This is expected behavior when real-time generation isn't available
- Check Succinct network status
- Verify PROVE token balance

**4. Backend won't start**
```bash
cd demo/backend
npm install  # Reinstall dependencies
node server.js  # Start with detailed logs
```

### Debugging Commands

```bash
# Test Rust binary directly with default transaction
cd ../script
NETWORK_PRIVATE_KEY=0x... cargo run --release --bin evm_prover_network -- --system groth16

# Test Rust binary with custom transaction
cd ../script
NETWORK_PRIVATE_KEY=0x... cargo run --release --bin evm_prover_network -- \
  --system groth16 \
  --transaction-hash 0xd25efc79e658a77d3a136a674c04be15a1d2dfc2a695412028a9e51f5c1ee900

# Test backend API
curl http://localhost:3001/api/status

# Check backend logs
cd demo/backend && npm start
```

## Cost Management

### Typical Costs

- **Simple proofs**: ~$0.50-$2.00 USD
- **Complex proofs**: ~$2.00-$10.00 USD
- **Very complex**: ~$10.00+ USD

### Cost Optimization

1. **Set price limits** in the Rust code:
   ```rust
   .max_price_per_pgu(1_000_000_000_000u64)  // 1 PROVE per billion PGU
   ```

2. **Monitor usage** via Succinct Explorer

3. **Use auction strategy** for competitive pricing:
   ```rust
   .strategy(FulfillmentStrategy::Auction)
   ```

## Production Considerations

### Security

- **Secure private keys**: Use proper key management in production
- **API authentication**: Add authentication to backend endpoints
- **Rate limiting**: Implement rate limiting for proof requests

### Scalability

- **Queue system**: Implement job queues for concurrent proof requests
- **Caching**: Cache successful proofs to avoid regeneration
- **Load balancing**: Scale backend horizontally if needed

### Monitoring

- **Health checks**: Implement health check endpoints
- **Metrics**: Track proof generation success/failure rates
- **Alerts**: Set up alerts for high costs or failures

## Next Steps

1. **Test the integration** with the existing fixture scenario
2. **Generate a new proof** for a different transaction
3. **Monitor costs** and optimize as needed
4. **Scale the system** based on usage patterns

For support, check:
- [Succinct Documentation](https://docs.succinct.xyz)
- [Succinct Discord](https://discord.gg/succinct)
- Backend logs and error messages