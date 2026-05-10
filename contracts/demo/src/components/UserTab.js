import React, { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { CONTRACTS, SLASHER_ABI } from '../contracts';
import { 
  verifyCommitmentSignature, 
  formatCommitmentForDisplay, 
  parseCommitmentFromJSON 
} from '../utils/eip712';
import { 
  checkTransactionInclusion, 
  getFinalizedMinusTwoFirstTransaction,
  validateTransactionHash,
  validateBlockNumber,
  validateTransactionIndex
} from '../utils/ethereum';
import { 
  generateSlashingProof, 
  validateSlashingProof, 
  formatProofInfo,
  isRealTimeProvingAvailable,
  getProofCostEstimate
} from '../utils/proofGeneration';

const UserTab = ({ wallet }) => {
  // Request Preconfirmation State
  const [requestForm, setRequestForm] = useState({
    blockNumber: '',
    transactionHash: '',
    transactionIndex: ''
  });
  const [suggestedTarget, setSuggestedTarget] = useState(null);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [targetLoading, setTargetLoading] = useState(false);
  const [currentCommitment, setCurrentCommitment] = useState(null);
  const [currentSignature, setCurrentSignature] = useState(null);

  // Verify Commitment State
  const [verifyForm, setVerifyForm] = useState({
    commitmentJSON: '',
    signature: '',
    proposerAddress: ''
  });
  const [verificationResult, setVerificationResult] = useState(null);

  // Check Inclusion State
  const [inclusionResult, setInclusionResult] = useState(null);

  // Slashing State
  const [slashingProof, setSlashingProof] = useState(null);
  const [slashingInProgress, setSlashingInProgress] = useState(false);
  const [slashingCompleted, setSlashingCompleted] = useState(false);
  
  // Real-time proving state
  const [realTimeProvingAvailable, setRealTimeProvingAvailable] = useState(false);
  const [costEstimate, setCostEstimate] = useState(null);

  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const networkName = wallet.getNetworkName();
  const slasherAddress = CONTRACTS[networkName]?.SLASHER;
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
  const selectedCommitmentCase = suggestedTarget?.commitmentCases?.find(
    (commitmentCase) => commitmentCase.id === selectedCaseId
  );

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  // Clean up error messages to remove duplicated prefixes
  const cleanErrorMessage = (message) => {
    if (!message) return message;
    
    // Remove redundant prefixes - be more aggressive about cleanup
    const patterns = [
      'Failed to generate slashing proof: ',
      'Cannot generate slashing proof: ',
      'Real-time proof generation failed: ',
      'Error generating slashing proof: ',
      'Failed to generate slashing proof:',
      'Cannot generate slashing proof:',
      'Real-time proof generation failed:',
      'Error generating slashing proof:'
    ];
    
    let cleaned = message;
    
    // First pass: remove all but the most meaningful prefix
    // Prioritize keeping "Cannot generate slashing proof:" as it's most specific
    if (cleaned.includes('Cannot generate slashing proof:')) {
      // Remove other redundant prefixes before "Cannot generate slashing proof:"
      patterns.forEach(pattern => {
        if (pattern !== 'Cannot generate slashing proof: ' && pattern !== 'Cannot generate slashing proof:') {
          cleaned = cleaned.replace(new RegExp(pattern, 'gi'), '');
        }
      });
    } else {
      // If no "Cannot generate" prefix, remove all duplicates normally
      let changed = true;
      while (changed) {
        changed = false;
        patterns.forEach(pattern => {
          const count = (cleaned.match(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
          if (count > 1) {
            cleaned = cleaned.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '');
            changed = true;
          }
        });
      }
    }
    
    return cleaned.trim();
  };

  const handleVerifyFormChange = (field, value) => {
    setVerifyForm(prev => ({ ...prev, [field]: value }));
  };

  const loadSuggestedTarget = useCallback(async () => {
    if (!wallet.isConnected || !wallet.provider) {
      setSuggestedTarget(null);
      setSelectedCaseId('');
      setRequestForm({
        blockNumber: '',
        transactionHash: '',
        transactionIndex: ''
      });
      return;
    }

    try {
      setTargetLoading(true);
      clearMessages();
      const target = await getFinalizedMinusTwoFirstTransaction(wallet.provider);
      setSuggestedTarget(target);
      setSelectedCaseId('');
    } catch (err) {
      console.error('Suggested target load error:', err);
      setSuggestedTarget(null);
      setSelectedCaseId('');
      setError(`Failed to load a recent finalized transaction: ${err.message}`);
    } finally {
      setTargetLoading(false);
    }
  }, [wallet.isConnected, wallet.provider]);

  useEffect(() => {
    loadSuggestedTarget();
  }, [loadSuggestedTarget]);

  useEffect(() => {
    if (!selectedCommitmentCase) {
      setRequestForm({
        blockNumber: '',
        transactionHash: '',
        transactionIndex: ''
      });
      return;
    }

    setRequestForm({
      blockNumber: selectedCommitmentCase.blockNumber.toString(),
      transactionHash: selectedCommitmentCase.transactionHash,
      transactionIndex: selectedCommitmentCase.transactionIndex.toString()
    });
  }, [selectedCommitmentCase]);

  const validateRequestForm = () => {
    const { blockNumber, transactionHash, transactionIndex } = requestForm;

    if (!validateBlockNumber(blockNumber)) {
      throw new Error('Invalid block number');
    }

    if (!validateTransactionHash(transactionHash)) {
      throw new Error('Invalid transaction hash format');
    }

    if (!validateTransactionIndex(transactionIndex)) {
      throw new Error('Invalid transaction index');
    }
  };

  const createPreconfirmationRequest = async () => {
    if (!wallet.isConnected) {
      setError('Please connect your wallet');
      return;
    }

    try {
      setLoading(true);
      clearMessages();

      if (!selectedCommitmentCase) {
        throw new Error('Choose a commitment case first');
      }

      validateRequestForm();
      if (!slasherAddress) {
        throw new Error(`Slasher contract is not deployed on ${networkName}`);
      }

      const commitment = {
        blockNumber: BigInt(requestForm.blockNumber),
        transactionHash: requestForm.transactionHash,
        transactionIndex: BigInt(requestForm.transactionIndex)
      };

      const response = await fetch(`${backendUrl}/api/proposer/sign-commitment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: wallet.chainId,
          verifyingContract: slasherAddress,
          commitment: formatCommitmentForDisplay(commitment)
        })
      });
      const signResult = await response.json();
      if (!response.ok) {
        throw new Error(signResult.error || 'Proposer failed to sign commitment');
      }

      const commitmentJSON = JSON.stringify(formatCommitmentForDisplay(commitment), null, 2);

      setCurrentCommitment(commitment);
      setCurrentSignature(signResult);
      setVerifyForm({
        commitmentJSON,
        signature: signResult.signature,
        proposerAddress: signResult.proposerAddress
      });
      setVerificationResult(null);
      setInclusionResult(null);
      setSlashingProof(null);
      setSuccess(`Proposer commitment received for ${selectedCommitmentCase.label} and verification form populated.`);

    } catch (err) {
      console.error('Request creation error:', err);
      setError(`Failed to create request: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const verifyCommitment = () => {
    try {
      clearMessages();

      const { commitmentJSON, signature, proposerAddress } = verifyForm;

      if (!commitmentJSON || !signature || !proposerAddress) {
        throw new Error('Please fill in all fields');
      }

      const commitment = parseCommitmentFromJSON(commitmentJSON);
      // Use the current network's chainId for verification (same as what was used for signing)
      
      const isValid = verifyCommitmentSignature(
        commitment,
        signature,
        proposerAddress,
        wallet.chainId,
        slasherAddress
      );

      setVerificationResult({
        isValid,
        commitment,
        signature,
        proposerAddress
      });

      if (isValid) {
        setSuccess('Signature verification successful!');
      } else {
        setError('Signature verification failed!');
      }

    } catch (err) {
      console.error('Verification error:', err);
      setError(`Verification failed: ${err.message}`);
    }
  };

  const checkInclusion = async () => {
    if (!verificationResult || !verificationResult.isValid) {
      setError('Please verify a valid commitment first');
      return;
    }

    try {
      setLoading(true);
      clearMessages();

      const { commitment } = verificationResult;
      
      const result = await checkTransactionInclusion(
        Number(commitment.blockNumber),
        commitment.transactionHash,
        Number(commitment.transactionIndex),
        wallet.provider
      );

      const resultWithNetwork = {
        ...result,
        chainId: wallet.chainId,
        networkName
      };

      setInclusionResult(resultWithNetwork);

      if (resultWithNetwork.isIncluded) {
        setSuccess('✅ Transaction was included at the promised position! Proposer fulfilled commitment.');
      } else {
        // Display specific violation message based on the type
        let violationDetails = resultWithNetwork.violationMessage || 'Transaction was NOT included at the promised position!';
        const slashabilityMessage = isSlashableViolationType(resultWithNetwork.violationType)
          ? 'This exact-position violation is slashable in this demo.'
          : 'This demo detects this violation type but cannot currently slash it.';
        setError(`❌ Commitment Violation Detected: ${violationDetails} ${slashabilityMessage}`);
      }

    } catch (err) {
      console.error('Inclusion check error:', err);
      setError(`Failed to check inclusion: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const generateSlashingProofForViolation = async () => {
    if (!verificationResult?.isValid || !inclusionResult || inclusionResult.isIncluded) {
      setError('No slashable violation detected');
      return;
    }

    if (!isSlashableViolationType(inclusionResult.violationType)) {
      setError(`Slashing is not supported for ${inclusionResult.violationType} violations in this demo`);
      return;
    }

    try {
      setLoading(true);
      clearMessages();

      console.log('Generating slashing proof for violation:', inclusionResult);

      const proof = await generateSlashingProof(inclusionResult, verificationResult.commitment);
      
      // Validate the proof can be used for slashing
      const validation = validateSlashingProof(proof, verificationResult.commitment, inclusionResult);
      
      if (!validation.isValid) {
        throw new Error(`Invalid slashing proof: ${validation.errors.join(', ')}`);
      }

      setSlashingProof(proof);
      setSuccess('Slashing proof generated successfully! You can now slash the proposer.');

    } catch (err) {
      console.error('Proof generation error:', err);
      setError(`Failed to generate slashing proof: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const executeSlashing = async () => {
    if (!slashingProof || !verificationResult || !wallet.signer) {
      setError('Missing required data for slashing');
      return;
    }

    try {
      setSlashingInProgress(true);
      clearMessages();

      // Get slasher contract
      const slasherContract = new ethers.Contract(slasherAddress, SLASHER_ABI, wallet.signer);

      console.log('Executing slashing with proof:', formatProofInfo(slashingProof));

      // Prepare commitment tuple for contract call
      const commitmentTuple = [
        verificationResult.commitment.blockNumber,
        verificationResult.commitment.transactionHash,
        verificationResult.commitment.transactionIndex
      ];

      // Extract signature components
      const signature = verificationResult.signature;
      const { v, r, s } = ethers.Signature.from(signature);

      setSuccess('Transaction submitted. Waiting for confirmation...');

      // Call slash function
      const tx = await slasherContract.slash(
        commitmentTuple,
        verificationResult.proposerAddress,
        v,
        r,
        s,
        slashingProof.publicValues,
        slashingProof.proofBytes
      );

      console.log('Slashing transaction submitted:', tx.hash);

      await tx.wait();

      setSuccess('✅ Slashing successful! Proposer has been slashed for breaking their commitment.');
      setSlashingCompleted(true);

      // Keep the success message visible for 10 seconds before resetting
      setTimeout(() => {
        setSlashingProof(null);
        setSlashingCompleted(false);
        clearMessages();
      }, 10000);

    } catch (err) {
      console.error('Slashing error:', err);
      
      // Parse contract errors
      let errorMessage = err.message;
      if (err.reason) {
        errorMessage = `Contract error: ${err.reason}`;
      } else if (err.data && typeof err.data === 'string') {
        // Map common error selectors to readable messages
        const errorMap = {
          '0xcf3e0074': 'CommitmentAlreadySlashed: This commitment has already been slashed',
          '0x4ca88867': 'InvalidSignature: The commitment signature is invalid', 
          '0x85415ec1': 'SlashingWindowExpired: The slashing window has expired',
          '0x1e4ec46b': 'InsufficientProposerBond: Proposer does not have sufficient bond to slash',
          '0xd2b8c7c9': 'TransactionWasIncluded: Cannot slash - the promised transaction was actually included',
          '0xc574ecb8': 'InvalidIncludedTransactionProof: Included-transaction proof has an invalid zero transaction hash',
          '0x187b05e7': 'InvalidNoTransactionProof: No-transaction proof must use a zero transaction hash',
          '0x7c946ed7': 'BlockNumberMismatch: Block number in proof does not match commitment',
          '0xe3479721': 'MissingCanonicalBlockHash: No canonical block metadata has been registered for this block',
          '0xe42b5e7e': 'BlockHashMismatch: Proof block hash does not match the registered canonical block hash',
          '0x8c379a00': 'TransactionIndexMismatch: Transaction index in proof does not match commitment'
        };
        
        const errorSelector = err.data.slice(0, 10);
        if (errorMap[errorSelector]) {
          errorMessage = errorMap[errorSelector];
        } else {
          errorMessage = `Unknown contract error (selector: ${errorSelector}): ${err.message}`;
        }
      }

      setError(`Failed to slash proposer: ${errorMessage}`);
    } finally {
      setSlashingInProgress(false);
    }
  };

  const canGenerateSlashingProof = () => {
    return verificationResult?.isValid && 
           inclusionResult && 
           !inclusionResult.isIncluded && 
           isSlashableViolationType(inclusionResult.violationType);
  };

  const isSlashableViolationType = (violationType) => {
    return ['DIFFERENT_TRANSACTION', 'NO_TRANSACTION', 'EMPTY_BLOCK', 'INDEX_OUT_OF_RANGE'].includes(violationType);
  };

  const getSlasherContract = () => {
    if (!wallet.signer || !slasherAddress) return null;
    return new ethers.Contract(slasherAddress, SLASHER_ABI, wallet.signer);
  };

  return (
    <div>
      {wallet.isConnected ? (
        <div className="contract-info">
          <div><strong>User Wallet:</strong> <span className="contract-address">{wallet.account}</span></div>
          <div><strong>Connected Network:</strong> {networkName}</div>
        </div>
      ) : (
        <div className="warning">
          Connect a wallet to request and verify commitments on a network.
        </div>
      )}

      {/* Request Preconfirmation */}
      <div className="section">
        <h3>1. Request Preconfirmation</h3>
        <p>
          {suggestedTarget
            ? `Choose a commitment case from block ${suggestedTarget.blockNumber}. This block was chosen from the most recent finalized range on the connected network.`
            : 'Load a recently finalized block from the connected network.'}
        </p>

        <div className="status-card">
          <h4>Suggested Commitment Target</h4>
          {targetLoading ? (
            <div>Loading a recently finalized transaction...</div>
          ) : suggestedTarget ? (
            <div className="info-grid">
              <div className="info-item">
                <strong>Finalized Block:</strong> {suggestedTarget.finalizedBlockNumber}
              </div>
              <div className="info-item">
                <strong>Target Block:</strong> {suggestedTarget.blockNumber}
              </div>
              <div className="info-item">
                <strong>Default Transaction Index:</strong> {suggestedTarget.transactionIndex}
              </div>
              <div className="info-item">
                <strong>Transactions In Block:</strong> {suggestedTarget.transactionCount}
              </div>
              <div className="info-item">
                <strong>Transaction Hash:</strong><br/>
                <code>{suggestedTarget.transactionHash}</code>
              </div>
              <div className="info-item">
                <strong>Block Hash:</strong><br/>
                <code>{suggestedTarget.blockHash}</code>
              </div>
            </div>
          ) : (
            <div className="warning">
              No suggested target loaded for the connected network.
            </div>
          )}

          <button
            className="btn btn-warning"
            onClick={loadSuggestedTarget}
            disabled={targetLoading || !wallet.isConnected}
          >
            {targetLoading ? 'Refreshing...' : 'Refresh Target'}
          </button>
        </div>

        {suggestedTarget?.commitmentCases?.length > 0 && (
          <div className="status-card">
            <h4>Choose Commitment Case</h4>
            <div className="case-grid">
              {suggestedTarget.commitmentCases.map((commitmentCase) => (
                <button
                  key={commitmentCase.id}
                  type="button"
                  className={`case-card case-card-${commitmentCase.tone} ${selectedCaseId === commitmentCase.id ? 'case-card-selected' : ''}`}
                  onClick={() => {
                    setSelectedCaseId(commitmentCase.id);
                    setCurrentCommitment(null);
                    setCurrentSignature(null);
                    setVerificationResult(null);
                    setInclusionResult(null);
                    setSlashingProof(null);
                    clearMessages();
                  }}
                >
                  <span className="case-title">{commitmentCase.label}</span>
                  <span className="case-outcome">{commitmentCase.outcome}</span>
                  <span className="case-description">{commitmentCase.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={createPreconfirmationRequest}
          disabled={loading || targetLoading || !wallet.isConnected || !selectedCommitmentCase}
        >
          {loading ? 'Requesting Commitment...' : 'Request Proposer Commitment'}
        </button>

        {/* Display Current Commitment */}
        {currentCommitment && (
          <div className="commitment-display">
            <h4>Generated Commitment:</h4>
            <div className="commitment-json">
              {JSON.stringify(formatCommitmentForDisplay(currentCommitment), null, 2)}
            </div>
            
            {currentSignature && (
              <div className="signature-display">
                <strong>Proposer:</strong> {currentSignature.proposerAddress}<br/>
                <strong>Signature:</strong> {currentSignature.signature}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Verify Commitment */}
      <div className="section">
        <h3>2. Verify Commitment Signature</h3>
        <p>Paste a commitment and signature to verify its authenticity.</p>

        <div className="form-group">
          <label>Commitment JSON:</label>
          <textarea
            className="form-control"
            rows="6"
            value={verifyForm.commitmentJSON}
            onChange={(e) => handleVerifyFormChange('commitmentJSON', e.target.value)}
            placeholder="Paste commitment JSON here..."
          />
        </div>

        <div className="form-group">
          <label>Signature:</label>
          <input
            type="text"
            className="form-control"
            value={verifyForm.signature}
            onChange={(e) => handleVerifyFormChange('signature', e.target.value)}
            placeholder="0x..."
          />
        </div>

        <div className="form-group">
          <label>Proposer Address:</label>
          <input
            type="text"
            className="form-control"
            value={verifyForm.proposerAddress}
            onChange={(e) => handleVerifyFormChange('proposerAddress', e.target.value)}
            placeholder="0x..."
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={verifyCommitment}
          disabled={loading}
        >
          {loading ? 'Verifying...' : 'Verify Signature'}
        </button>

        {/* Contextual messages for verification */}
        {error && error.includes('signature') && (
          <div className="alert alert-error" style={{ marginTop: '10px' }}>
            <strong>⚠️ Verification Error:</strong> {cleanErrorMessage(error)}
          </div>
        )}
        
        {success && success.includes('signature') && (
          <div className="alert alert-success" style={{ marginTop: '10px' }}>
            <strong>✅ Success:</strong> {success}
          </div>
        )}

        {verificationResult && (
          <div className={`status-card ${verificationResult.isValid ? 'status-success' : 'status-error'}`}>
            <strong>Verification Result:</strong> {verificationResult.isValid ? 'Valid ✅' : 'Invalid ❌'}
            {verificationResult.isValid && (
              <div style={{ marginTop: '10px' }}>
                <div>Block: {verificationResult.commitment.blockNumber.toString()}</div>
                <div>Transaction: {verificationResult.commitment.transactionHash}</div>
                <div>Index: {verificationResult.commitment.transactionIndex.toString()}</div>
                <div>Fulfillment Time: registered canonical block timestamp</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Check Transaction Inclusion */}
      <div className="section">
        <h3>3. Check Transaction Inclusion</h3>
        <p>Verify if the transaction was actually included at the promised position.</p>

        <button
          className="btn btn-primary"
          onClick={checkInclusion}
          disabled={loading || !verificationResult?.isValid}
        >
          {loading ? 'Checking Inclusion...' : 'Check Transaction Inclusion'}
        </button>

        {success && success.includes('included at the promised position') && (
          <div className="alert alert-success" style={{ marginTop: '10px' }}>
            <strong>✅ Success:</strong> {success}
          </div>
        )}

        {!verificationResult?.isValid && (
          <div className="warning">
            Please verify a valid commitment first to check inclusion.
          </div>
        )}

        {inclusionResult && (
          <div className="status-card">
            <h4>Inclusion Check Result:</h4>
            <div className="info-grid">
              <div className="info-item">
                <strong>Block Number:</strong> {inclusionResult.blockNumber}
              </div>
              <div className="info-item">
                <strong>Expected Tx Hash:</strong><br/>
                <code>{inclusionResult.expectedTransactionHash}</code>
              </div>
              <div className="info-item">
                <strong>Actual Tx Hash:</strong><br/>
                <code>{inclusionResult.actualTransactionHash}</code>
              </div>
              <div className="info-item">
                <strong>Position:</strong> {inclusionResult.transactionIndex}
              </div>
              <div className="info-item">
                <strong>Included:</strong> 
                <span style={{ 
                  color: inclusionResult.isIncluded ? 'green' : 'red',
                  fontWeight: 'bold',
                  marginLeft: '5px'
                }}>
                  {inclusionResult.isIncluded ? 'YES ✅' : 'NO ❌'}
                </span>
              </div>
            </div>

            {inclusionResult.transaction && (
              <div style={{ marginTop: '15px' }}>
                <strong>Transaction Details:</strong>
                <div className="commitment-json">
                  {JSON.stringify(inclusionResult.transaction, null, 2)}
                </div>
              </div>
            )}

            {!inclusionResult.isIncluded && (
              <div className="error" style={{ marginTop: '15px' }}>
                <strong>⚠️ Commitment Violation Detected!</strong><br/>
                {inclusionResult.violationMessage || `Transaction ${inclusionResult.expectedTransactionHash} was not included at position ${inclusionResult.expectedTransactionIndex} in block ${inclusionResult.blockNumber}.`}
                <br/><br/>
                <strong>Violation Type:</strong> {inclusionResult.violationType || 'UNKNOWN'}
                <br/><br/>
                {isSlashableViolationType(inclusionResult.violationType)
                  ? 'This exact-position violation is slashable in this demo.'
                  : 'This demo detects this violation type but cannot currently slash it.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slash Proposer */}
      {((inclusionResult && !inclusionResult.isIncluded) || slashingCompleted) && (
        <div className="section">
          <h3>4. Slash Proposer</h3>
          
          {slashingCompleted ? (
            <div className="success">
              <strong>✅ Slashing Completed Successfully!</strong><br/>
              The proposer has been slashed for breaking their commitment.
            </div>
          ) : isSlashableViolationType(inclusionResult?.violationType) ? (
            <div>
              <div className="success" style={{ marginBottom: '15px' }}>
                <strong>✅ Slashable Violation Detected!</strong><br/>
                {inclusionResult?.violationType === 'DIFFERENT_TRANSACTION'
                  ? 'A different transaction was included at the promised position.'
                  : 'No transaction exists at the promised position.'} This proposer can be slashed.
              </div>

              {!slashingProof ? (
                <div>
                  <div className="warning">
                    <strong>Step 1:</strong> Generate a ZK proof for the detected exact-position violation.
                  </div>
                  
                  <button
                    className="btn btn-warning"
                    onClick={generateSlashingProofForViolation}
                    disabled={loading || !canGenerateSlashingProof() || !wallet.isConnected}
                  >
                    {loading ? 'Generating Proof...' : 'Generate Slashing Proof'}
                  </button>

                  {/* Contextual messages for proof generation */}
                  {error && (error.includes('slashing proof') || error.includes('Cannot generate slashing proof')) && (
                    <div className="alert alert-error" style={{ marginTop: '10px' }}>
                      <strong>⚠️ Proof Generation Failed:</strong> {cleanErrorMessage(error)}
                    </div>
                  )}

                  {!wallet.isConnected && (
                    <div className="warning" style={{ marginTop: '10px' }}>
                      Please connect your wallet to generate slashing proof.
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="status-card status-success">
                    <h4>Exact-position Violation Proof Generated ✅</h4>
                    <div className="info-grid">
                      <div className="info-item">
                        <strong>Proof Type:</strong> {slashingProof.proofType}
                      </div>
                      <div className="info-item">
                        <strong>Real Proof:</strong> {slashingProof.isRealProof ? 'Yes (Succinct)' : 'No (Demo Mock)'}
                      </div>
                      <div className="info-item">
                        <strong>Block Number:</strong> {formatProofInfo(slashingProof).blockNumber}
                      </div>
                      <div className="info-item">
                        <strong>Transaction Hash:</strong><br/>
                        <code>{formatProofInfo(slashingProof).transactionHash}</code>
                      </div>
                      <div className="info-item">
                        <strong>Index:</strong> {formatProofInfo(slashingProof).transactionIndex}
                      </div>
                      <div className="info-item">
                        <strong>Included:</strong> {formatProofInfo(slashingProof).isIncluded ? 'Yes' : 'No'}
                      </div>
                    </div>

                    {slashingProof.isRealProof && (
                      <div className="contract-info" style={{ marginTop: '15px' }}>
                        <strong>🎉 Using Real Succinct Proof!</strong><br/>
                        This proof was generated by the Succinct prover network for position {formatProofInfo(slashingProof).transactionIndex} in block {formatProofInfo(slashingProof).blockNumber}.
                      </div>
                    )}
                  </div>

                  <div className="warning" style={{ margin: '15px 0' }}>
                    <strong>Step 2:</strong> Execute slashing by calling the slasher contract. This will slash 0.1 ETH from the proposer's bond.
                    The owner must register the canonical block hash and timestamp before this transaction can succeed.
                  </div>

                  <button
                    className="btn btn-danger"
                    onClick={executeSlashing}
                    disabled={slashingInProgress || !wallet.isConnected}
                    style={{ marginRight: '10px' }}
                  >
                    {slashingInProgress ? 'Slashing...' : 'Execute Slashing'}
                  </button>

                  {/* Contextual messages for slashing execution */}
                  {error && (error.includes('slashing') || error.includes('transaction failed')) && !error.includes('proof') && (
                    <div className="alert alert-error" style={{ marginTop: '10px' }}>
                      <strong>⚠️ Slashing Failed:</strong> {cleanErrorMessage(error)}
                    </div>
                  )}
                  
                  {success && (
                    <div className="alert alert-success" style={{ marginTop: '10px' }}>
                      <strong>
                        {success.includes('Slashing successful') || success.includes('slashed')
                          ? '🎉 Slashing Successful:'
                          : 'Slashing Progress:'}
                      </strong> {success}
                    </div>
                  )}

                  <button
                    className="btn btn-warning"
                    onClick={() => setSlashingProof(null)}
                    disabled={slashingInProgress}
                  >
                    Cancel
                  </button>
                </div>
              )}
              
              <div className="contract-info" style={{ marginTop: '15px' }}>
                <strong>Slasher Contract:</strong> 
                <span className="contract-address"> {slasherAddress || 'Not deployed on current network'}</span>
              </div>
            </div>
          ) : (
            <div className="warning">
              <strong>Slashing Not Available:</strong> This demo only supports exact-position violation proofs. 
              Current violation type: {inclusionResult.violationType}
              
              <div style={{ marginTop: '10px', fontSize: '14px' }}>
                <strong>Supported:</strong> Different transaction at the promised position, or no transaction at the promised position<br/>
                <strong>Not supported:</strong> Block not found, proposer missed-duty evidence, broader whole-block omission claims
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UserTab;
