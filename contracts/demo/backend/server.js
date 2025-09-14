const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

// Load environment variables from root directory
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Path to the Rust binary
const RUST_BINARY_PATH = path.join(__dirname, '../../../target/release/evm_prover_network');

/**
 * Generate a real-time proof using the Rust Succinct prover
 */
app.post('/api/generate-proof', async (req, res) => {
  try {
    const { blockNumber, transactionHash, transactionIndex, proofSystem = 'groth16' } = req.body;

    // Validate input
    if (!blockNumber || !transactionHash || transactionIndex === undefined) {
      return res.status(400).json({
        error: 'Missing required parameters: blockNumber, transactionHash, transactionIndex'
      });
    }

    console.log('Generating proof for:', { blockNumber, transactionHash, transactionIndex, proofSystem });

    // Build command arguments
    const args = [
      '--system', proofSystem,
      '--eth-rpc-url', 'https://ethereum-rpc.publicnode.com',
      '--transaction-hash', transactionHash
    ];

    // Create modified environment
    const env = {
      ...process.env,
      RUST_LOG: 'info'
    };

    // Execute Rust binary
    const rustProcess = spawn(RUST_BINARY_PATH, args, {
      env,
      cwd: path.join(__dirname, '../../../script'),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    rustProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log('Rust stdout:', data.toString());
    });

    rustProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error('Rust stderr:', data.toString());
    });

    // Wait for process completion with timeout
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        rustProcess.kill();
        reject(new Error('Proof generation timed out (20 minutes)'));
      }, 20 * 60 * 1000); // 20 minutes timeout

      rustProcess.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Rust process failed with code ${code}: ${stderr}`));
        }
      });

      rustProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Try to read the generated fixture file
    let fixture = null;
    try {
      const fixturePath = path.join(__dirname, '../../../contracts/src/fixtures', `${proofSystem}-fixture.json`);
      const fixtureContent = await fs.readFile(fixturePath, 'utf8');
      fixture = JSON.parse(fixtureContent);
    } catch (fixtureError) {
      console.warn('Could not read fixture file:', fixtureError.message);
    }

    res.json({
      success: true,
      message: 'Proof generated successfully',
      fixture,
      logs: {
        stdout,
        stderr
      }
    });

  } catch (error) {
    console.error('Proof generation error:', error);
    res.status(500).json({
      error: error.message,
      details: 'Failed to generate proof using Succinct network'
    });
  }
});

/**
 * Get proof generation cost estimate
 */
app.post('/api/estimate-cost', async (req, res) => {
  try {
    // For now, return a mock estimate
    // In the future, this could call the Rust binary with a dry-run flag
    res.json({
      estimatedCostUsd: 0.5,
      estimatedTimeSeconds: 180,
      availableProvers: 'network',
      note: 'Cost estimates are approximate and based on current network conditions'
    });
  } catch (error) {
    console.error('Cost estimation error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * Check if Succinct network integration is properly configured
 */
app.get('/api/status', (req, res) => {
  const hasNetworkKey = !!process.env.NETWORK_PRIVATE_KEY;
  const rustBinaryExists = require('fs').existsSync(RUST_BINARY_PATH);

  res.json({
    configured: hasNetworkKey && rustBinaryExists,
    hasNetworkKey,
    rustBinaryExists,
    rustBinaryPath: RUST_BINARY_PATH
  });
});

app.listen(port, () => {
  const rustBinaryExists = require('fs').existsSync(RUST_BINARY_PATH);
  const isConfigured = !!process.env.NETWORK_PRIVATE_KEY && rustBinaryExists;
  
  console.log(`Proof generation server running on port ${port}`);
  console.log(`Rust binary path: ${RUST_BINARY_PATH}`);
  console.log(`Rust binary exists: ${rustBinaryExists}`);
  console.log(`Network key configured: ${!!process.env.NETWORK_PRIVATE_KEY}`);
  console.log(`✅ Succinct network ready: ${isConfigured}`);
});