import React, { useState, useEffect, useCallback } from 'react';
import { CONTRACTS } from '../contracts';

const ProposerTab = ({ wallet }) => {
  const [bondAmount, setBondAmount] = useState('0.1');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [proposerInfo, setProposerInfo] = useState({
    address: '',
    balance: '0',
    currentBond: '0',
    pendingWithdrawal: '0',
    withdrawalTimestamp: '0',
    canWithdraw: false
  });
  const [constants, setConstants] = useState({
    minBondAmount: '0',
    slashAmount: '0',
    withdrawalDelay: '0'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const networkName = wallet.getNetworkName();
  const slasherAddress = CONTRACTS[networkName]?.SLASHER;
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const loadProposerInfo = useCallback(async () => {
    if (!wallet.chainId || !slasherAddress) return;

    try {
      const params = new URLSearchParams({
        chainId: wallet.chainId,
        slasherAddress
      });
      const response = await fetch(`${backendUrl}/api/proposer/status?${params.toString()}`);
      const result = await response.json();
      if (!response.ok || !result.configured) {
        throw new Error(result.error || 'Failed to load proposer status');
      }

      setProposerInfo({
        address: result.address,
        balance: result.balance,
        currentBond: result.currentBond,
        pendingWithdrawal: result.pendingWithdrawal,
        withdrawalTimestamp: result.withdrawalTimestamp,
        canWithdraw: result.canWithdraw
      });

      setConstants({
        minBondAmount: result.minBondAmount,
        slashAmount: result.slashAmount,
        withdrawalDelay: result.withdrawalDelay
      });

    } catch (err) {
      console.error('Error loading proposer info:', err);
      setError(err.message);
    }
  }, [wallet.chainId, slasherAddress, backendUrl]);

  useEffect(() => {
    loadProposerInfo();
  }, [loadProposerInfo]);

  const handleAddBond = async () => {
    if (!bondAmount || parseFloat(bondAmount) <= 0) {
      setError('Please enter a valid bond amount');
      return;
    }

    if (!wallet.chainId || !slasherAddress) {
      setError('Connect a supported network before adding a proposer bond');
      return;
    }

    try {
      setLoading(true);
      clearMessages();

      const response = await fetch(`${backendUrl}/api/proposer/add-bond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: wallet.chainId,
          slasherAddress,
          amountEth: bondAmount
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to add bond');
      }
      
      setSuccess(`Bond added successfully. Transaction: ${result.hash}`);
      setBondAmount('0.1');
      await loadProposerInfo();
      
    } catch (err) {
      console.error('Add bond error:', err);
      setError(`Failed to add bond: ${err.reason || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateWithdrawal = async () => {
    if (!withdrawalAmount || parseFloat(withdrawalAmount) <= 0) {
      setError('Please enter a valid withdrawal amount');
      return;
    }

    if (!wallet.chainId || !slasherAddress) {
      setError('Connect a supported network before initiating withdrawal');
      return;
    }

    try {
      setLoading(true);
      clearMessages();

      const response = await fetch(`${backendUrl}/api/proposer/initiate-withdrawal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: wallet.chainId,
          slasherAddress,
          amountEth: withdrawalAmount
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to initiate withdrawal');
      }
      
      setSuccess(`Withdrawal initiated successfully. Transaction: ${result.hash}`);
      setWithdrawalAmount('');
      await loadProposerInfo();
      
    } catch (err) {
      console.error('Initiate withdrawal error:', err);
      setError(`Failed to initiate withdrawal: ${err.reason || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteWithdrawal = async () => {
    if (!wallet.chainId || !slasherAddress) {
      setError('Connect a supported network before completing withdrawal');
      return;
    }

    try {
      setLoading(true);
      clearMessages();

      const response = await fetch(`${backendUrl}/api/proposer/complete-withdrawal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: wallet.chainId,
          slasherAddress
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to complete withdrawal');
      }
      
      setSuccess(`Withdrawal completed successfully. Transaction: ${result.hash}`);
      await loadProposerInfo();
      
    } catch (err) {
      console.error('Complete withdrawal error:', err);
      setError(`Failed to complete withdrawal: ${err.reason || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (timestamp === '0') return 'Not set';
    return new Date(parseInt(timestamp) * 1000).toLocaleString();
  };

  const formatDelay = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hours`;
  };

  if (!wallet.isConnected) {
    return (
      <div className="warning">
        Connect a wallet to select the network for proposer bond operations.
      </div>
    );
  }

  if (!slasherAddress) {
    return (
      <div className="error">
        Slasher contract not deployed on {networkName} network.
        <div className="contract-info">
          <strong>Available networks:</strong>
          <ul>
            <li>Sepolia: {CONTRACTS.SEPOLIA.SLASHER}</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="contract-info">
        <div><strong>Network:</strong> {networkName}</div>
        <div><strong>Slasher Contract:</strong> 
          <span className="contract-address"> {slasherAddress}</span>
        </div>
        <div><strong>Proposer Address:</strong> 
          <span className="contract-address"> {proposerInfo.address || 'Not configured'}</span>
        </div>
        <div><strong>Proposer Wallet Balance:</strong> 
          <span> {proposerInfo.balance} ETH</span>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* Contract Constants */}
      <div className="section">
        <h3>Contract Information</h3>
        <div className="info-grid">
          <div className="info-item">
            <strong>Minimum Bond:</strong> {constants.minBondAmount} ETH
          </div>
          <div className="info-item">
            <strong>Slash Amount:</strong> {constants.slashAmount} ETH
          </div>
          <div className="info-item">
            <strong>Withdrawal Delay:</strong> {formatDelay(constants.withdrawalDelay)}
          </div>
        </div>
      </div>

      {/* Current Status */}
      <div className="section">
        <h3>Proposer Bond Status</h3>
        <div className="info-grid">
          <div className="info-item">
            <strong>Current Bond:</strong> {proposerInfo.currentBond} ETH
          </div>
          <div className="info-item">
            <strong>Pending Withdrawal:</strong> {proposerInfo.pendingWithdrawal} ETH
          </div>
          <div className="info-item">
            <strong>Withdrawal Available At:</strong> {formatTimestamp(proposerInfo.withdrawalTimestamp)}
          </div>
          <div className="info-item">
            <strong>Can Withdraw Now:</strong> {proposerInfo.canWithdraw ? 'Yes' : 'No'}
          </div>
        </div>
      </div>

      {/* Add Bond */}
      <div className="section">
        <h3>Add Bond</h3>
        <div className="form-group">
          <label>Bond Amount (ETH):</label>
          <input
            type="number"
            step="0.01"
            min="0.1"
            className="form-control"
            value={bondAmount}
            onChange={(e) => setBondAmount(e.target.value)}
            placeholder="0.1"
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={handleAddBond}
          disabled={loading || !bondAmount}
        >
          {loading ? 'Adding Bond...' : 'Add Bond'}
        </button>
      </div>

      {/* Withdraw Bond */}
      <div className="section">
        <h3>Withdraw Bond</h3>
        
        {/* Initiate Withdrawal */}
        <div className="form-group">
          <label>Withdrawal Amount (ETH):</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max={proposerInfo.currentBond}
            className="form-control"
            value={withdrawalAmount}
            onChange={(e) => setWithdrawalAmount(e.target.value)}
            placeholder="Enter amount to withdraw"
          />
        </div>
        <button
          className="btn btn-warning"
          onClick={handleInitiateWithdrawal}
          disabled={loading || !withdrawalAmount || parseFloat(proposerInfo.currentBond) === 0}
        >
          {loading ? 'Initiating...' : 'Initiate Withdrawal'}
        </button>

        {/* Complete Withdrawal */}
        {proposerInfo.pendingWithdrawal !== '0' && (
          <div style={{marginTop: '20px'}}>
              <div className="warning">
              Proposer has {proposerInfo.pendingWithdrawal} ETH pending withdrawal.
              {proposerInfo.canWithdraw ? 
                ' The withdrawal can be completed now.' : 
                ' Wait until the delay period expires.'
              }
            </div>
            <button
              className="btn btn-success"
              onClick={handleCompleteWithdrawal}
              disabled={loading || !proposerInfo.canWithdraw}
            >
              {loading ? 'Completing...' : 'Complete Withdrawal'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProposerTab;
