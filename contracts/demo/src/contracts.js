// Contract addresses - update these with your deployed contracts
export const CONTRACTS = {
  SEPOLIA: {
    SLASHER: '0x047c9fBa113c14e3F7F987C9D8F29dd3C0160796',
    VERIFIER: '0xCa1BA4D2630cC7aCa1F7ef463498a83151A56166',
  },
  // Add mainnet addresses when deployed
  MAINNET: {
    SLASHER: '', // To be deployed
    VERIFIER: '', // To be deployed
  }
};

// Network configurations
export const NETWORKS = {
  SEPOLIA: {
    chainId: '0xaa36a7', // 11155111 in hex
    chainName: 'Sepolia test network',
    nativeCurrency: {
      name: 'SepoliaETH',
      symbol: 'SEP',
      decimals: 18,
    },
    rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
  },
  MAINNET: {
    chainId: '0x1', // 1 in hex
    chainName: 'Ethereum Mainnet',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: ['https://ethereum-rpc.publicnode.com'],
    blockExplorerUrls: ['https://etherscan.io'],
  }
};

// Contract ABIs - simplified for demo
export const SLASHER_ABI = [
  {
    "inputs": [{"type": "address"}],
    "name": "getProposerBond",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "addBond",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"type": "uint256"}],
    "name": "initiateWithdrawal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "completeWithdrawal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"type": "address"}],
    "name": "getPendingWithdrawal",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"type": "address"}],
    "name": "getWithdrawalTimestamp",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "SLASH_AMOUNT",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MIN_BOND_AMOUNT",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "WITHDRAWAL_DELAY",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "DOMAIN_SEPARATOR",
    "outputs": [{"type": "bytes32"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "COMMITMENT_TYPEHASH",
    "outputs": [{"type": "bytes32"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {"name": "blockNumber", "type": "uint64"},
          {"name": "transactionHash", "type": "bytes32"},
          {"name": "transactionIndex", "type": "uint64"}
        ],
        "name": "commitment",
        "type": "tuple"
      },
      {"name": "proposer", "type": "address"},
      {"name": "v", "type": "uint8"},
      {"name": "r", "type": "bytes32"},
      {"name": "s", "type": "bytes32"},
      {"name": "publicValues", "type": "bytes"},
      {"name": "proofBytes", "type": "bytes"}
    ],
    "name": "slash",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "commitmentHash", "type": "bytes32"}],
    "name": "isCommitmentSlashed",
    "outputs": [{"type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  }
];

// EIP-712 domain and types for signing
export const EIP712_DOMAIN = {
  name: 'TxInclusionPreciseSlasher',
  version: '1',
  chainId: null, // Will be set dynamically
  verifyingContract: null, // Will be set dynamically
};

export const EIP712_TYPES = {
  InclusionCommitment: [
    { name: 'blockNumber', type: 'uint64' },
    { name: 'transactionHash', type: 'bytes32' },
    { name: 'transactionIndex', type: 'uint64' },
  ],
};
