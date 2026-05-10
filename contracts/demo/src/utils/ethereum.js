import { ethers } from 'ethers';

// Create a provider for querying mainnet data.
export const getMainnetProvider = () => {
  return new ethers.JsonRpcProvider('https://ethereum-rpc.publicnode.com');
};

const toHexBlockNumber = (blockNumber) => {
  return `0x${Number(blockNumber).toString(16)}`;
};

const getQueryProvider = (provider) => provider || getMainnetProvider();

const normalizeTransactionDetails = (transactionHashOrObject) => {
  if (!transactionHashOrObject) {
    return { transactionHash: null, transactionDetails: null };
  }

  if (typeof transactionHashOrObject === 'string') {
    return { transactionHash: transactionHashOrObject, transactionDetails: null };
  }

  return {
    transactionHash: transactionHashOrObject.hash,
    transactionDetails: {
      from: transactionHashOrObject.from,
      to: transactionHashOrObject.to,
      value: ethers.formatEther(transactionHashOrObject.value || 0),
      gasLimit: transactionHashOrObject.gasLimit?.toString() || transactionHashOrObject.gas?.toString(),
      gasPrice: transactionHashOrObject.gasPrice ? ethers.formatUnits(transactionHashOrObject.gasPrice, 'gwei') : null,
      nonce: Number(transactionHashOrObject.nonce)
    }
  };
};

const normalizeTransactionHash = (transactionHashOrObject) => {
  if (!transactionHashOrObject) {
    return null;
  }
  return typeof transactionHashOrObject === 'string'
    ? transactionHashOrObject
    : transactionHashOrObject.hash;
};

const findAlternateCommittedTransaction = (transactions) => {
  if (!transactions || transactions.length < 2) {
    return null;
  }

  const firstTransaction = transactions[0];
  const firstSender = typeof firstTransaction === 'string'
    ? null
    : firstTransaction.from?.toLowerCase();

  if (firstSender) {
    const alternate = transactions
      .slice(1)
      .find((transaction) => transaction.from?.toLowerCase() !== firstSender);
    if (alternate) {
      return alternate;
    }
  }

  return transactions[1];
};

const buildCommitmentCases = (block, targetBlockNumber) => {
  const transactions = block.transactions || [];
  const firstTransaction = transactions[0];
  const alternateTransaction = findAlternateCommittedTransaction(transactions);
  const { transactionHash: firstTransactionHash } = normalizeTransactionDetails(firstTransaction);
  const cases = [
    {
      id: 'FULFILLED',
      label: 'Fulfilled commitment',
      outcome: 'Correct inclusion',
      tone: 'success',
      description: 'The proposer signs a promise that matches what the block actually contains. The inclusion check should pass, so there should be nothing to slash.',
      blockNumber: targetBlockNumber,
      blockHash: block.hash,
      transactionHash: firstTransactionHash,
      transactionIndex: 0,
      observedTransactionHash: firstTransactionHash,
      proofMode: 'not-needed'
    },
    {
      id: 'NO_TRANSACTION',
      label: 'No transaction at promised position',
      outcome: 'Slashable absence',
      tone: 'danger',
      description: 'The proposer signs a promise for a position that does not exist in this block. The user can prove the block ended before that promised position, so the proposer broke the exact-position promise.',
      blockNumber: targetBlockNumber,
      blockHash: block.hash,
      transactionHash: firstTransactionHash,
      transactionIndex: transactions.length,
      observedTransactionHash: null,
      proofMode: 'absence'
    }
  ];

  if (alternateTransaction) {
    cases.splice(1, 0, {
      id: 'DIFFERENT_TRANSACTION',
      label: 'Different transaction at promised position',
      outcome: 'Slashable mismatch',
      tone: 'danger',
      description: 'The proposer signs a promise for one transaction, but the block contains a different transaction at that same promised position. The user can prove the mismatch and slash the proposer.',
      blockNumber: targetBlockNumber,
      blockHash: block.hash,
      transactionHash: normalizeTransactionHash(alternateTransaction),
      transactionIndex: 0,
      observedTransactionHash: firstTransactionHash,
      proofMode: 'different-transaction'
    });
  }

  return cases;
};

export const getFinalizedMinusTwoFirstTransaction = async (provider) => {
  const queryProvider = getQueryProvider(provider);
  const finalizedBlock = await queryProvider.send('eth_getBlockByNumber', ['finalized', false]);

  if (!finalizedBlock?.number) {
    throw new Error('Could not fetch finalized block from connected network');
  }

  const finalizedBlockNumber = Number(BigInt(finalizedBlock.number));
  const targetBlockNumber = finalizedBlockNumber - 2;
  if (targetBlockNumber <= 0) {
    throw new Error(`Finalized block ${finalizedBlockNumber} is too low for finalized - 2`);
  }

  const block = await queryProvider.send('eth_getBlockByNumber', [toHexBlockNumber(targetBlockNumber), true]);
  if (!block) {
    throw new Error(`Could not fetch block ${targetBlockNumber}`);
  }
  if (!block.transactions || block.transactions.length === 0) {
    throw new Error(`Block ${targetBlockNumber} has no transactions`);
  }

  const firstTransaction = block.transactions[0];
  const { transactionHash, transactionDetails } = normalizeTransactionDetails(firstTransaction);
  const commitmentCases = buildCommitmentCases(block, targetBlockNumber);

  return {
    finalizedBlockNumber,
    blockNumber: targetBlockNumber,
    blockHash: block.hash,
    transactionHash,
    transactionIndex: 0,
    transactionCount: block.transactions.length,
    transaction: transactionDetails,
    commitmentCases
  };
};

export const getTransactionAtIndex = async (blockNumber, transactionIndex, provider) => {
  try {
    const queryProvider = getQueryProvider(provider);
    
    // Get the block with all transactions
    const block = await queryProvider.getBlock(blockNumber, true);
    
    if (!block) {
      return {
        blockHash: null,
        blockNumber: blockNumber,
        transactionHash: null,
        transactionIndex: transactionIndex,
        transaction: null,
        error: 'BLOCK_NOT_FOUND',
        errorMessage: `No block proposed at slot ${blockNumber}`
      };
    }

    // Check if block is empty or has no transactions
    if (!block.transactions || block.transactions.length === 0) {
      return {
        blockHash: block.hash,
        blockNumber: block.number,
        transactionHash: null,
        transactionIndex: transactionIndex,
        transaction: null,
        error: 'EMPTY_BLOCK',
        errorMessage: `No transactions in block ${blockNumber}`
      };
    }

    // Check if transaction index is out of range
    if (transactionIndex >= block.transactions.length) {
      return {
        blockHash: block.hash,
        blockNumber: block.number,
        transactionHash: null,
        transactionIndex: transactionIndex,
        transaction: null,
        error: 'INDEX_OUT_OF_RANGE',
        errorMessage: `No transaction at position ${transactionIndex}. Block has ${block.transactions.length} transactions.`,
        actualTransactionCount: block.transactions.length
      };
    }

    const transactionHashOrObject = block.transactions[transactionIndex];
    
    // Handle both cases: transaction hash string or transaction object
    const { transactionHash, transactionDetails } = normalizeTransactionDetails(transactionHashOrObject);
    
    console.log('Debug - Block has', block.transactions.length, 'transactions');
    console.log('Debug - Final transaction hash:', transactionHash);
    
    return {
      blockHash: block.hash,
      blockNumber: block.number,
      transactionHash: transactionHash || null,
      transactionIndex: transactionIndex,
      transaction: transactionDetails,
      error: null,
      errorMessage: null
    };
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return {
      blockHash: null,
      blockNumber: blockNumber,
      transactionHash: null,
      transactionIndex: transactionIndex,
      transaction: null,
      error: 'FETCH_ERROR',
      errorMessage: `Failed to fetch block ${blockNumber}: ${error.message}`
    };
  }
};

export const checkTransactionInclusion = async (blockNumber, expectedTxHash, expectedTxIndex, provider) => {
  try {
    const result = await getTransactionAtIndex(blockNumber, expectedTxIndex, provider);
    
    if (!expectedTxHash) {
      throw new Error('Expected transaction hash is empty');
    }
    
    // If there was an error fetching the transaction, it's always a broken commitment
    if (result.error) {
      return {
        ...result,
        actualTransactionHash: result.transactionHash, // Add this alias for proof generation
        expectedTransactionHash: expectedTxHash,
        expectedTransactionIndex: expectedTxIndex,
        isIncluded: false,
        violationType: result.error,
        violationMessage: result.errorMessage
      };
    }
    
    const actualTxHash = result.transactionHash;
    const isIncluded = actualTxHash && actualTxHash.toLowerCase() === expectedTxHash.toLowerCase();
    
    // Determine violation type for UI display
    let violationType = null;
    let violationMessage = null;
    
    if (!isIncluded) {
      if (actualTxHash) {
        violationType = 'DIFFERENT_TRANSACTION';
        violationMessage = `A different transaction (${actualTxHash}) was included at the promised position ${expectedTxIndex}`;
      } else {
        violationType = 'NO_TRANSACTION';
        violationMessage = `No transaction was included at the promised position ${expectedTxIndex}`;
      }
    }
    
    return {
      ...result,
      actualTransactionHash: result.transactionHash, // Add this alias for proof generation
      expectedTransactionHash: expectedTxHash,
      expectedTransactionIndex: expectedTxIndex,
      isIncluded,
      violationType,
      violationMessage
    };
  } catch (error) {
    throw new Error(`Failed to check transaction inclusion: ${error.message}`);
  }
};

export const getCurrentBlock = async (provider) => {
  try {
    const queryProvider = getQueryProvider(provider);
    return await queryProvider.getBlockNumber();
  } catch (error) {
    console.error('Error getting current block:', error);
    throw error;
  }
};

export const validateTransactionHash = (hash) => {
  if (!hash) return false;
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
};

export const validateBlockNumber = (blockNumber) => {
  const num = parseInt(blockNumber);
  return !isNaN(num) && num > 0 && num < Number.MAX_SAFE_INTEGER;
};

export const validateTransactionIndex = (index) => {
  const num = parseInt(index);
  return !isNaN(num) && num >= 0 && num < 10000; // Reasonable upper limit
};
