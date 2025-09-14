import { ethers } from 'ethers';

// Real proof data from Succinct prover network
export const PROOF_FIXTURE = {
  "blockHash": "0x7ad3d805da4793feb857ce3476979617b84074c68be96a846d3d5d028611d719",
  "blockNumber": 23330039,
  "transactionHash": "0x9bd463b17765f462c6e24ded54663ab87cc2babca5ac7c94a704273f746b44c7",
  "transactionIndex": 33,
  "isIncluded": true,
  "verifiedAgainstRoot": "0xfdde62e55a60ff3c14379570b1a005fce5f2c66e29448e94418bab3a9591121c",
  "vkey": "0x00c88cfee30cdc47103e28f414f4546bf7f4675ec944d46ec7b4eb4b3300f306",
  "publicValues": "0x7ad3d805da4793feb857ce3476979617b84074c68be96a846d3d5d028611d719000000000000000000000000000000000000000000000000000000000163fcf79bd463b17765f462c6e24ded54663ab87cc2babca5ac7c94a704273f746b44c700000000000000000000000000000000000000000000000000000000000000210000000000000000000000000000000000000000000000000000000000000001fdde62e55a60ff3c14379570b1a005fce5f2c66e29448e94418bab3a9591121c",
  "proof": "0xa4594c5919ad7c1b1830b708a13ed6576897bf05d5ae1c4ad1a7aa417cab505fc9c4c26828aa4f94c4fe5b1b23962cb7f34a92b87b99190d6e8da106ce6f858a8c78c7d71c3f24053010c263c2c9c43fd1343d379ecb51d0c2ba7308af358d322e1e64f615d516196491ee9427ac3e79a7e88f4a44657ae29178d561e4b16ac226cdb09e2e3dab87dc1981a978cadbf841422ef28083abef631e23cad15b254d9034403d02a4d9fbf78e7aff41f43f2ee21b205f1d20a231e7d2d0b4bbfbf050b8ef17d80b54616db5a587858b019f7da0c5d81a69aa66b621d69eacc2d8b9017bf099250d7ac261b871577c315004973bda80e593de257860973898662d6f82bc95c89d"
};

// PublicValuesStruct format for the contract
export const createPublicValuesStruct = (blockHash, blockNumber, transactionHash, transactionIndex, isIncluded, verifiedAgainstRoot) => {
  return {
    blockHash,
    blockNumber,
    transactionHash,
    transactionIndex,
    isIncluded,
    verifiedAgainstRoot
  };
};

// Encode public values for contract call
export const encodePublicValues = (publicValuesStruct) => {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ['tuple(bytes32,uint64,bytes32,uint64,bool,bytes32)'],
    [[
      publicValuesStruct.blockHash,
      publicValuesStruct.blockNumber,
      publicValuesStruct.transactionHash,
      publicValuesStruct.transactionIndex,
      publicValuesStruct.isIncluded,
      publicValuesStruct.verifiedAgainstRoot
    ]]
  );
};

// Generate slashing proof for DIFFERENT_TRANSACTION case
export const generateSlashingProof = async (inclusionResult, commitment) => {
  try {
    // For the demo, we'll use the real proof if it matches our scenario
    // In production, this would call the Succinct prover network with the actual transaction data
    
    const actualTxHash = inclusionResult.actualTransactionHash;
    const blockNumber = inclusionResult.blockNumber;
    const transactionIndex = inclusionResult.transactionIndex;

    // Check if we can use the real proof fixture
    const canUseRealProof = (
      blockNumber === PROOF_FIXTURE.blockNumber &&
      transactionIndex === PROOF_FIXTURE.transactionIndex &&
      actualTxHash.toLowerCase() === PROOF_FIXTURE.transactionHash.toLowerCase()
    );

    if (canUseRealProof) {
      console.log('Using real Succinct proof for slashing');
      
      // Use the real proof data
      const publicValuesStruct = createPublicValuesStruct(
        PROOF_FIXTURE.blockHash,
        PROOF_FIXTURE.blockNumber,
        PROOF_FIXTURE.transactionHash,
        PROOF_FIXTURE.transactionIndex,
        PROOF_FIXTURE.isIncluded,
        PROOF_FIXTURE.verifiedAgainstRoot
      );

      return {
        publicValues: PROOF_FIXTURE.publicValues,
        proofBytes: PROOF_FIXTURE.proof,
        publicValuesStruct,
        isRealProof: true,
        proofType: 'SUCCINCT_GROTH16'
      };
    } else {
      // Try to generate real-time proof if backend is available
      console.log('Attempting real-time proof generation via Succinct network...');
      
      try {
        const realTimeProof = await generateRealTimeProof(inclusionResult);
        console.log('Successfully generated real-time proof!');
        return realTimeProof;
      } catch (realTimeError) {
        console.error('Real-time proof generation failed:', realTimeError.message);
        throw new Error(
          `Cannot generate slashing proof: Real-time proof generation failed (${realTimeError.message}). ` +
          `This transaction/block combination does not match the pre-generated fixture and the Succinct prover network is not available. ` +
          `Please either: 1) Use the specific fixture scenario (block 23330039, index 33), or 2) Configure the Succinct prover network with proper credentials.`
        );
      }
    }
  } catch (error) {
    console.error('Error generating slashing proof:', error);
    throw new Error(`Failed to generate slashing proof: ${error.message}`);
  }
};

// Generate a real-time proof using the backend service
export const generateRealTimeProof = async (inclusionResult) => {
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
  
  try {
    // Check if backend is configured
    const statusResponse = await fetch(`${backendUrl}/api/status`);
    const status = await statusResponse.json();
    
    if (!status.configured) {
      throw new Error('Backend service is not properly configured for Succinct network');
    }

    console.log('Backend service is configured, generating real-time proof...');
    
    const response = await fetch(`${backendUrl}/api/generate-proof`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        blockNumber: inclusionResult.blockNumber,
        transactionHash: inclusionResult.actualTransactionHash,
        transactionIndex: inclusionResult.transactionIndex,
        proofSystem: 'groth16'
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Backend service error');
    }

    const result = await response.json();
    
    if (!result.success || !result.fixture) {
      throw new Error('Invalid response from backend service');
    }

    const fixture = result.fixture;
    
    // Convert the fixture to the expected format
    const publicValuesStruct = createPublicValuesStruct(
      fixture.blockHash,
      fixture.blockNumber,
      fixture.transactionHash,
      fixture.transactionIndex,
      fixture.isIncluded,
      fixture.verifiedAgainstRoot
    );

    return {
      publicValues: fixture.publicValues,
      proofBytes: fixture.proof,
      publicValuesStruct,
      isRealProof: true,
      proofType: 'SUCCINCT_REAL_TIME',
      logs: result.logs
    };
    
  } catch (error) {
    console.error('Real-time proof generation failed:', error);
    throw error;
  }
};

// Get cost estimate for proof generation
export const getProofCostEstimate = async (inclusionResult) => {
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
  
  try {
    const response = await fetch(`${backendUrl}/api/estimate-cost`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        blockNumber: inclusionResult.blockNumber,
        transactionIndex: inclusionResult.transactionIndex
      }),
    });

    if (!response.ok) {
      return { estimatedCostUsd: 0.5, estimatedTimeSeconds: 180, availableProvers: 'unknown' };
    }

    return await response.json();
  } catch (error) {
    console.error('Cost estimation failed:', error);
    return { estimatedCostUsd: 0.5, estimatedTimeSeconds: 180, availableProvers: 'unknown' };
  }
};

// Check if real-time proving is available
export const isRealTimeProvingAvailable = async () => {
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
  
  try {
    const response = await fetch(`${backendUrl}/api/status`);
    const status = await response.json();
    return status.configured;
  } catch (error) {
    return false;
  }
};

// Validate that proof can be used for slashing
export const validateSlashingProof = (proof, commitment, inclusionResult) => {
  const errors = [];

  // Check block number matches (handle string vs number comparison)
  if (Number(proof.publicValuesStruct.blockNumber) !== Number(commitment.blockNumber)) {
    errors.push('Proof block number does not match commitment');
  }

  // Check transaction index matches (handle string vs number comparison)
  if (Number(proof.publicValuesStruct.transactionIndex) !== Number(commitment.transactionIndex)) {
    errors.push('Proof transaction index does not match commitment');
  }

  // Check isIncluded is true
  if (!proof.publicValuesStruct.isIncluded) {
    errors.push('Proof must show transaction was included');
  }

  // Check transaction hash is different from commitment
  if (proof.publicValuesStruct.transactionHash.toLowerCase() === commitment.transactionHash.toLowerCase()) {
    errors.push('Proof transaction hash cannot be the same as committed transaction');
  }

  // Check transaction hash matches what was actually found
  if (proof.publicValuesStruct.transactionHash.toLowerCase() !== inclusionResult.actualTransactionHash.toLowerCase()) {
    errors.push('Proof transaction hash does not match actual transaction found');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Format proof info for display
export const formatProofInfo = (proof) => {
  return {
    type: proof.proofType,
    isReal: proof.isRealProof,
    blockNumber: proof.publicValuesStruct.blockNumber.toString(),
    transactionHash: proof.publicValuesStruct.transactionHash,
    transactionIndex: proof.publicValuesStruct.transactionIndex.toString(),
    isIncluded: proof.publicValuesStruct.isIncluded,
    publicValuesLength: proof.publicValues.length,
    proofBytesLength: proof.proofBytes.length
  };
};