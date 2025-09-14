import { ethers } from 'ethers';

// Real proof data from Succinct prover network
export const PROOF_FIXTURE = {
  "blockHash": "0xc936613ff8e7fb04ed39ef9e25417f779b187d449b04c7ade75917ff33166021",
  "blockNumber": 23354683,
  "transactionHash": "0xd54acc3d86cf83ee241a6ad2cc5d394e91d142b85c96d7611b72bc267a9f9436",
  "transactionIndex": 87,
  "isIncluded": true,
  "verifiedAgainstRoot": "0xad94b067bdbce131ff2c2bb4ca7274ea5c48cfa5123b1b5687c25061ff1b8190",
  "vkey": "0x00a1bde4932d9b0fdf65b292dba44b3b23131b5d925592a06fe17735e3d49769",
  "publicValues": "0xc936613ff8e7fb04ed39ef9e25417f779b187d449b04c7ade75917ff331660210000000000000000000000000000000000000000000000000000000001645d3bd54acc3d86cf83ee241a6ad2cc5d394e91d142b85c96d7611b72bc267a9f943600000000000000000000000000000000000000000000000000000000000000570000000000000000000000000000000000000000000000000000000000000001ad94b067bdbce131ff2c2bb4ca7274ea5c48cfa5123b1b5687c25061ff1b8190",
  "proof": "0xa4594c5903aa57653ef8e85cc3f671b9353a623214794bd52b854b55c84e2fad418e8a23031b028a3808bb700df247193211994642097837adb8409b4118cea21d50bd832f015a635a1a7ba9fa58a54cb719005c150c46d5b5a41666154fccca290abc4e2d207adce3d466993c4f1167d0475b68dc176f2006a59233049f44a1c141eb7a1f3e0c3ee76f803dc4859b7b9329235b330416889f3d74ef7ec498b9e84b6f602ab21ebe055bcbb29dd900a07fe428d447e0ed6f284306152e15d249ef8cf89d27e89ce30fc23307a0e536bbfedf7f6f2822f8fee639b4d2ea96f2c275ff449405bf8b4808ecc8210760d3313f57e017935609651b28f1fbe970be43d7a8989c"
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
          `Please either: 1) Use the specific fixture scenario (block 23354683, index 87), or 2) Configure the Succinct prover network with proper credentials.`
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