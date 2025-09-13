import { ethers } from 'ethers';

// Create a provider for querying mainnet data (commitments always on mainnet)
export const getMainnetProvider = () => {
  return new ethers.JsonRpcProvider('https://ethereum-rpc.publicnode.com');
};

export const getTransactionAtIndex = async (blockNumber, transactionIndex) => {
  try {
    const provider = getMainnetProvider();
    
    // Get the block with all transactions
    const block = await provider.getBlock(blockNumber, true);
    
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
    let transactionHash;
    let transactionDetails = null;
    
    if (typeof transactionHashOrObject === 'string') {
      // If it's a string, it's just the hash
      transactionHash = transactionHashOrObject;
      console.log('Debug - Got transaction hash string:', transactionHash);
    } else if (transactionHashOrObject && typeof transactionHashOrObject === 'object') {
      // If it's an object, get the hash property
      transactionHash = transactionHashOrObject.hash;
      transactionDetails = {
        from: transactionHashOrObject.from,
        to: transactionHashOrObject.to,
        value: ethers.formatEther(transactionHashOrObject.value || 0),
        gasLimit: transactionHashOrObject.gasLimit?.toString(),
        gasPrice: transactionHashOrObject.gasPrice ? ethers.formatUnits(transactionHashOrObject.gasPrice, 'gwei') : null,
        nonce: transactionHashOrObject.nonce
      };
      console.log('Debug - Got transaction object with hash:', transactionHash);
    }
    
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

export const checkTransactionInclusion = async (blockNumber, expectedTxHash, expectedTxIndex) => {
  try {
    const result = await getTransactionAtIndex(blockNumber, expectedTxIndex);
    
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

export const getCurrentBlock = async () => {
  try {
    const provider = getMainnetProvider();
    return await provider.getBlockNumber();
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