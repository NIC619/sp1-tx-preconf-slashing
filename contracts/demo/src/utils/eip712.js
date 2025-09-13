import { ethers } from 'ethers';
import { EIP712_DOMAIN, EIP712_TYPES } from '../contracts';

export const createCommitmentHash = (commitment, chainId, verifyingContract) => {
  const domain = {
    ...EIP712_DOMAIN,
    chainId: parseInt(chainId, 16),
    verifyingContract
  };

  return ethers.TypedDataEncoder.hash(domain, EIP712_TYPES, commitment);
};

export const signCommitment = async (signer, commitment, chainId, verifyingContract) => {
  const domain = {
    ...EIP712_DOMAIN,
    chainId: parseInt(chainId, 16),
    verifyingContract
  };

  try {
    const signature = await signer.signTypedData(domain, EIP712_TYPES, commitment);
    const { v, r, s } = ethers.Signature.from(signature);
    
    return {
      signature,
      v,
      r,
      s
    };
  } catch (error) {
    console.error('Signing error:', error);
    throw new Error(`Failed to sign commitment: ${error.message}`);
  }
};

export const verifyCommitmentSignature = (commitment, signature, signerAddress, chainId, verifyingContract) => {
  try {
    const domain = {
      ...EIP712_DOMAIN,
      chainId: parseInt(chainId, 16),
      verifyingContract
    };

    const recoveredAddress = ethers.verifyTypedData(
      domain,
      EIP712_TYPES,
      commitment,
      signature
    );

    return recoveredAddress.toLowerCase() === signerAddress.toLowerCase();
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};

export const formatCommitmentForDisplay = (commitment) => {
  return {
    blockNumber: commitment.blockNumber.toString(),
    transactionHash: commitment.transactionHash,
    transactionIndex: commitment.transactionIndex.toString(),
    deadline: new Date(parseInt(commitment.deadline) * 1000).toISOString()
  };
};

export const parseCommitmentFromJSON = (jsonString) => {
  try {
    const parsed = JSON.parse(jsonString);
    
    // Convert string numbers back to appropriate types
    return {
      blockNumber: BigInt(parsed.blockNumber),
      transactionHash: parsed.transactionHash,
      transactionIndex: BigInt(parsed.transactionIndex),
      deadline: BigInt(Math.floor(new Date(parsed.deadline).getTime() / 1000))
    };
  } catch (error) {
    throw new Error('Invalid commitment JSON format');
  }
};