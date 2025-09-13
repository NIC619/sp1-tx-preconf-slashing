import React, { useState } from 'react';
import { CONTRACTS } from '../contracts';
import { 
  signCommitment, 
  verifyCommitmentSignature, 
  formatCommitmentForDisplay, 
  parseCommitmentFromJSON 
} from '../utils/eip712';
import { 
  checkTransactionInclusion, 
  getCurrentBlock,
  validateTransactionHash,
  validateBlockNumber,
  validateTransactionIndex
} from '../utils/ethereum';

const UserTab = ({ wallet }) => {
  // Request Preconfirmation State
  const [requestForm, setRequestForm] = useState({
    proposerAddress: '',
    blockNumber: '',
    transactionHash: '',
    transactionIndex: '',
    hoursFromNow: '1'
  });
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

  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const networkName = wallet.getNetworkName();
  const slasherAddress = CONTRACTS[networkName]?.SLASHER;

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const handleRequestFormChange = (field, value) => {
    setRequestForm(prev => ({ ...prev, [field]: value }));
  };

  const handleVerifyFormChange = (field, value) => {
    setVerifyForm(prev => ({ ...prev, [field]: value }));
  };

  const validateRequestForm = () => {
    const { proposerAddress, blockNumber, transactionHash, transactionIndex, hoursFromNow } = requestForm;

    if (!proposerAddress || !proposerAddress.startsWith('0x') || proposerAddress.length !== 42) {
      throw new Error('Invalid proposer address');
    }

    if (!validateBlockNumber(blockNumber)) {
      throw new Error('Invalid block number');
    }

    if (!validateTransactionHash(transactionHash)) {
      throw new Error('Invalid transaction hash format');
    }

    if (!validateTransactionIndex(transactionIndex)) {
      throw new Error('Invalid transaction index');
    }

    const hours = parseFloat(hoursFromNow);
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      throw new Error('Hours from now must be between 0 and 24');
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

      validateRequestForm();

      const deadline = Math.floor(Date.now() / 1000) + (parseFloat(requestForm.hoursFromNow) * 3600);

      const commitment = {
        blockNumber: BigInt(requestForm.blockNumber),
        transactionHash: requestForm.transactionHash,
        transactionIndex: BigInt(requestForm.transactionIndex),
        deadline: BigInt(deadline)
      };

      // Note: In a real app, you would send this to the proposer to sign
      // For demo purposes, we'll have the connected wallet sign it
      // Use the current network's chainId for signing (proposer signs on their connected network)
      const signResult = await signCommitment(
        wallet.signer, 
        commitment, 
        wallet.chainId, 
        slasherAddress
      );

      setCurrentCommitment(commitment);
      setCurrentSignature(signResult);
      setSuccess('Preconfirmation request created and signed!');

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
        Number(commitment.transactionIndex)
      );

      setInclusionResult(result);

      if (result.isIncluded) {
        setSuccess('✅ Transaction was included at the promised position! Proposer fulfilled commitment.');
      } else {
        // Display specific violation message based on the type
        let violationDetails = result.violationMessage || 'Transaction was NOT included at the promised position!';
        setError(`❌ Commitment Violation Detected: ${violationDetails} Proposer can be slashed.`);
      }

    } catch (err) {
      console.error('Inclusion check error:', err);
      setError(`Failed to check inclusion: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fillCurrentBlock = async () => {
    try {
      const currentBlock = await getCurrentBlock();
      setRequestForm(prev => ({ ...prev, blockNumber: currentBlock.toString() }));
    } catch (err) {
      setError('Failed to get current block number');
    }
  };

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* Request Preconfirmation */}
      <div className="section">
        <h3>1. Request Preconfirmation</h3>
        <p>Fill in the transaction details and request a preconfirmation from a proposer.</p>
        
        <div className="form-group">
          <label>Proposer Address:</label>
          <input
            type="text"
            className="form-control"
            value={requestForm.proposerAddress}
            onChange={(e) => handleRequestFormChange('proposerAddress', e.target.value)}
            placeholder="0x..."
          />
        </div>

        <div className="form-group">
          <label>Block Number:</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="number"
              className="form-control"
              value={requestForm.blockNumber}
              onChange={(e) => handleRequestFormChange('blockNumber', e.target.value)}
              placeholder="Block number"
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={fillCurrentBlock}>
              Use Current Block
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Transaction Hash:</label>
          <input
            type="text"
            className="form-control"
            value={requestForm.transactionHash}
            onChange={(e) => handleRequestFormChange('transactionHash', e.target.value)}
            placeholder="0x..."
          />
        </div>

        <div className="form-group">
          <label>Transaction Index:</label>
          <input
            type="number"
            className="form-control"
            value={requestForm.transactionIndex}
            onChange={(e) => handleRequestFormChange('transactionIndex', e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="form-group">
          <label>Deadline (Hours from now):</label>
          <input
            type="number"
            step="0.1"
            className="form-control"
            value={requestForm.hoursFromNow}
            onChange={(e) => handleRequestFormChange('hoursFromNow', e.target.value)}
            placeholder="1"
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={createPreconfirmationRequest}
          disabled={loading}
        >
          {loading ? 'Creating Request...' : 'Create & Sign Request'}
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
        >
          Verify Signature
        </button>

        {verificationResult && (
          <div className={`status-card ${verificationResult.isValid ? 'status-success' : 'status-error'}`}>
            <strong>Verification Result:</strong> {verificationResult.isValid ? 'Valid ✅' : 'Invalid ❌'}
            {verificationResult.isValid && (
              <div style={{ marginTop: '10px' }}>
                <div>Block: {verificationResult.commitment.blockNumber.toString()}</div>
                <div>Transaction: {verificationResult.commitment.transactionHash}</div>
                <div>Index: {verificationResult.commitment.transactionIndex.toString()}</div>
                <div>Deadline: {new Date(Number(verificationResult.commitment.deadline) * 1000).toLocaleString()}</div>
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
                This proposer can be slashed for breaking their commitment.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slash Proposer */}
      {inclusionResult && !inclusionResult.isIncluded && (
        <div className="section">
          <h3>4. Slash Proposer</h3>
          <div className="warning">
            <strong>Implementation Note:</strong> The slashing functionality requires integration with the deployed slasher contract and ZK proof generation. In a production implementation, this would:
            <ul style={{ marginTop: '10px', textAlign: 'left' }}>
              <li>Generate a ZK proof that the wrong transaction is at the specified index</li>
              <li>Call the slasher contract's slash() function with the proof</li>
              <li>Burn the proposer's bond as punishment</li>
            </ul>
          </div>
          
          <div className="contract-info">
            <strong>Slasher Contract:</strong> {slasherAddress || 'Not deployed on current network'}
          </div>

          <button
            className="btn btn-danger"
            disabled={true}
          >
            Slash Proposer (Coming Soon)
          </button>
        </div>
      )}
    </div>
  );
};

export default UserTab;