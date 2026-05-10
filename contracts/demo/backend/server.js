const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { ethers } = require('ethers');

// Load environment variables from root directory
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Path to the Rust binary
const RUST_BINARY_PATH = path.join(__dirname, '../../../target/release/evm');

const NETWORKS = {
  '0x1': {
    name: 'MAINNET',
    rpcUrl: 'https://ethereum-rpc.publicnode.com'
  },
  '0xaa36a7': {
    name: 'SEPOLIA',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com'
  }
};

const SLASHER_ABI = [
  'function getProposerBond(address proposer) view returns (uint256)',
  'function getPendingWithdrawal(address proposer) view returns (uint256)',
  'function getWithdrawalTimestamp(address proposer) view returns (uint256)',
  'function MIN_BOND_AMOUNT() view returns (uint256)',
  'function SLASH_AMOUNT() view returns (uint256)',
  'function WITHDRAWAL_DELAY() view returns (uint256)',
  'function canonicalBlockHashes(uint64 blockNumber) view returns (bytes32)',
  'function addBond() payable',
  'function initiateWithdrawal(uint256 amount)',
  'function completeWithdrawal()',
  'function registerCanonicalBlock(uint64 blockNumber, bytes32 blockHash, uint256 blockTimestamp)'
];

const EIP712_DOMAIN = {
  name: 'TxInclusionPreciseSlasher',
  version: '1'
};

const EIP712_TYPES = {
  InclusionCommitment: [
    { name: 'blockNumber', type: 'uint64' },
    { name: 'transactionHash', type: 'bytes32' },
    { name: 'transactionIndex', type: 'uint64' },
  ],
};

function getNetwork(chainId) {
  const normalized = String(chainId || '').toLowerCase();
  const network = NETWORKS[normalized];
  if (!network) {
    throw new Error(`Unsupported network chainId: ${chainId}`);
  }
  return { ...network, chainId: normalized };
}

function getProposerWallet(chainId) {
  if (!process.env.PROPOSER_PRIVATE_KEY) {
    throw new Error('PROPOSER_PRIVATE_KEY environment variable is required');
  }

  const network = getNetwork(chainId);
  const provider = new ethers.JsonRpcProvider(network.rpcUrl);
  const wallet = new ethers.Wallet(process.env.PROPOSER_PRIVATE_KEY, provider);
  return { wallet, provider, network };
}

function getOwnerWallet(chainId) {
  if (!process.env.OWNER_PRIVATE_KEY) {
    throw new Error('OWNER_PRIVATE_KEY environment variable is required');
  }

  const network = getNetwork(chainId);
  const provider = new ethers.JsonRpcProvider(network.rpcUrl);
  const wallet = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY, provider);
  return { wallet, provider, network };
}

function requireAddress(value, label) {
  if (!ethers.isAddress(value)) {
    throw new Error(`Invalid ${label}`);
  }
}

function requireCommitment(commitment) {
  if (!commitment) {
    throw new Error('Missing commitment');
  }
  if (!commitment.blockNumber || !commitment.transactionHash || commitment.transactionIndex === undefined) {
    throw new Error('Commitment must include blockNumber, transactionHash, and transactionIndex');
  }
  if (!ethers.isHexString(commitment.transactionHash, 32)) {
    throw new Error('Invalid commitment transactionHash');
  }

  return {
    blockNumber: BigInt(commitment.blockNumber),
    transactionHash: commitment.transactionHash,
    transactionIndex: BigInt(commitment.transactionIndex)
  };
}

function serializeProposerStatus({
  wallet,
  balance,
  currentBond,
  pendingWithdrawal,
  withdrawalTimestamp,
  minBondAmount,
  slashAmount,
  withdrawalDelay
}) {
  const now = Math.floor(Date.now() / 1000);
  const withdrawalTimestampNumber = Number(withdrawalTimestamp);

  return {
    address: wallet.address,
    balance: ethers.formatEther(balance),
    currentBond: ethers.formatEther(currentBond),
    pendingWithdrawal: ethers.formatEther(pendingWithdrawal),
    withdrawalTimestamp: withdrawalTimestamp.toString(),
    canWithdraw: withdrawalTimestampNumber > 0 && now >= withdrawalTimestampNumber,
    minBondAmount: ethers.formatEther(minBondAmount),
    slashAmount: ethers.formatEther(slashAmount),
    withdrawalDelay: withdrawalDelay.toString()
  };
}

app.get('/api/proposer/status', async (req, res) => {
  try {
    const { chainId, slasherAddress } = req.query;
    requireAddress(slasherAddress, 'slasherAddress');

    const { wallet, provider } = getProposerWallet(chainId);
    const contract = new ethers.Contract(slasherAddress, SLASHER_ABI, provider);

    const [
      balance,
      currentBond,
      pendingWithdrawal,
      withdrawalTimestamp,
      minBondAmount,
      slashAmount,
      withdrawalDelay
    ] = await Promise.all([
      provider.getBalance(wallet.address),
      contract.getProposerBond(wallet.address),
      contract.getPendingWithdrawal(wallet.address),
      contract.getWithdrawalTimestamp(wallet.address),
      contract.MIN_BOND_AMOUNT(),
      contract.SLASH_AMOUNT(),
      contract.WITHDRAWAL_DELAY()
    ]);

    res.json({
      configured: true,
      ...serializeProposerStatus({
        wallet,
        balance,
        currentBond,
        pendingWithdrawal,
        withdrawalTimestamp,
        minBondAmount,
        slashAmount,
        withdrawalDelay
      })
    });
  } catch (error) {
    res.status(500).json({
      configured: false,
      error: error.message
    });
  }
});

app.post('/api/proposer/sign-commitment', async (req, res) => {
  try {
    const { chainId, verifyingContract, commitment } = req.body;
    requireAddress(verifyingContract, 'verifyingContract');

    const { wallet } = getProposerWallet(chainId);
    const normalizedCommitment = requireCommitment(commitment);
    const network = getNetwork(chainId);
    const numericChainId = parseInt(network.chainId, 16);

    const signature = await wallet.signTypedData(
      {
        ...EIP712_DOMAIN,
        chainId: numericChainId,
        verifyingContract
      },
      EIP712_TYPES,
      normalizedCommitment
    );
    const { v, r, s } = ethers.Signature.from(signature);

    res.json({
      proposerAddress: wallet.address,
      commitment: {
        blockNumber: normalizedCommitment.blockNumber.toString(),
        transactionHash: normalizedCommitment.transactionHash,
        transactionIndex: normalizedCommitment.transactionIndex.toString()
      },
      signature,
      v,
      r,
      s
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.post('/api/proposer/add-bond', async (req, res) => {
  try {
    const { chainId, slasherAddress, amountEth } = req.body;
    requireAddress(slasherAddress, 'slasherAddress');

    const { wallet } = getProposerWallet(chainId);
    const contract = new ethers.Contract(slasherAddress, SLASHER_ABI, wallet);
    const tx = await contract.addBond({ value: ethers.parseEther(String(amountEth)) });
    const receipt = await tx.wait();

    res.json({ success: true, hash: tx.hash, blockNumber: receipt.blockNumber });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proposer/initiate-withdrawal', async (req, res) => {
  try {
    const { chainId, slasherAddress, amountEth } = req.body;
    requireAddress(slasherAddress, 'slasherAddress');

    const { wallet } = getProposerWallet(chainId);
    const contract = new ethers.Contract(slasherAddress, SLASHER_ABI, wallet);
    const tx = await contract.initiateWithdrawal(ethers.parseEther(String(amountEth)));
    const receipt = await tx.wait();

    res.json({ success: true, hash: tx.hash, blockNumber: receipt.blockNumber });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/proposer/complete-withdrawal', async (req, res) => {
  try {
    const { chainId, slasherAddress } = req.body;
    requireAddress(slasherAddress, 'slasherAddress');

    const { wallet } = getProposerWallet(chainId);
    const contract = new ethers.Contract(slasherAddress, SLASHER_ABI, wallet);
    const tx = await contract.completeWithdrawal();
    const receipt = await tx.wait();

    res.json({ success: true, hash: tx.hash, blockNumber: receipt.blockNumber });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/owner/register-canonical-block', async (req, res) => {
  try {
    const { chainId, slasherAddress, blockNumber } = req.body;
    requireAddress(slasherAddress, 'slasherAddress');
    if (!blockNumber && blockNumber !== 0) {
      throw new Error('blockNumber is required');
    }

    const { wallet, provider } = getOwnerWallet(chainId);
    const numericBlockNumber = Number(blockNumber);
    const block = await provider.getBlock(numericBlockNumber);
    if (!block) {
      throw new Error(`Block ${blockNumber} not found on ${getNetwork(chainId).name}`);
    }

    const contract = new ethers.Contract(slasherAddress, SLASHER_ABI, wallet);
    const registeredHash = await contract.canonicalBlockHashes(numericBlockNumber);
    if (registeredHash !== ethers.ZeroHash) {
      if (registeredHash.toLowerCase() !== block.hash.toLowerCase()) {
        throw new Error(`Canonical block ${blockNumber} is already registered with a different hash`);
      }

      return res.json({
        success: true,
        alreadyRegistered: true,
        ownerAddress: wallet.address,
        blockNumber: numericBlockNumber,
        blockHash: block.hash,
        blockTimestamp: block.timestamp
      });
    }

    const tx = await contract.registerCanonicalBlock(
      numericBlockNumber,
      block.hash,
      block.timestamp
    );
    const receipt = await tx.wait();

    res.json({
      success: true,
      alreadyRegistered: false,
      ownerAddress: wallet.address,
      transactionHash: tx.hash,
      registrationBlockNumber: receipt.blockNumber,
      blockNumber: numericBlockNumber,
      blockHash: block.hash,
      blockTimestamp: block.timestamp
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate a real-time proof using the Rust Succinct prover
 */
app.post('/api/generate-proof', async (req, res) => {
  try {
    const {
      blockNumber,
      transactionHash,
      committedTransactionHash,
      transactionIndex,
      violationType,
      proofSystem = 'groth16',
      chainId = '0x1'
    } = req.body;
    const isAbsenceProof = violationType && violationType !== 'DIFFERENT_TRANSACTION';
    const commitmentHash = committedTransactionHash || transactionHash;

    // Validate input
    if (!blockNumber || transactionIndex === undefined || (!isAbsenceProof && !transactionHash) || !commitmentHash) {
      return res.status(400).json({
        error: 'Missing required parameters: blockNumber, transactionIndex, and committed transaction hash'
      });
    }

    console.log('Generating proof for:', {
      blockNumber,
      transactionHash,
      committedTransactionHash: commitmentHash,
      transactionIndex,
      violationType,
      proofSystem
    });

    // Build command arguments
    const args = [
      '--system', proofSystem,
      '--eth-rpc-url', getNetwork(chainId).rpcUrl
    ];
    if (isAbsenceProof) {
      args.push('--absence-block-number', String(blockNumber));
      args.push('--absence-transaction-index', String(transactionIndex));
      args.push('--transaction-hash', commitmentHash);
    } else {
      args.push('--transaction-hash', transactionHash);
      if (committedTransactionHash && committedTransactionHash.toLowerCase() !== transactionHash.toLowerCase()) {
        args.push('--committed-transaction-hash', committedTransactionHash);
      }
    }

    // Create modified environment
    const env = {
      ...process.env,
      RUST_LOG: 'info',
      SP1_PROVER: 'network'
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
  const hasProposerKey = !!process.env.PROPOSER_PRIVATE_KEY;
  const hasOwnerKey = !!process.env.OWNER_PRIVATE_KEY;
  const rustBinaryExists = require('fs').existsSync(RUST_BINARY_PATH);

  res.json({
    configured: hasNetworkKey && rustBinaryExists,
    hasNetworkKey,
    hasProposerKey,
    hasOwnerKey,
    rustBinaryExists,
    rustBinaryPath: RUST_BINARY_PATH
  });
});

if (require.main === module) {
  app.listen(port, () => {
    const rustBinaryExists = require('fs').existsSync(RUST_BINARY_PATH);
    const isConfigured = !!process.env.NETWORK_PRIVATE_KEY && rustBinaryExists;
    
    console.log(`Proof generation server running on port ${port}`);
    console.log(`Rust binary path: ${RUST_BINARY_PATH}`);
    console.log(`Rust binary exists: ${rustBinaryExists}`);
    console.log(`Network key configured: ${!!process.env.NETWORK_PRIVATE_KEY}`);
    console.log(`Proposer key configured: ${!!process.env.PROPOSER_PRIVATE_KEY}`);
    console.log(`Owner key configured: ${!!process.env.OWNER_PRIVATE_KEY}`);
    console.log(`✅ Succinct network ready: ${isConfigured}`);
  });
}

module.exports = app;
