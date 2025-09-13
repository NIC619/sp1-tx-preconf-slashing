import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { CONTRACTS, SLASHER_ABI } from '../contracts';

const ProposerTab = ({ wallet }) => {
  const [bondAmount, setBondAmount] = useState('0.1');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [proposerInfo, setProposerInfo] = useState({
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

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const getSlasherContract = useCallback(() => {
    if (!wallet.signer || !slasherAddress) return null;
    return new ethers.Contract(slasherAddress, SLASHER_ABI, wallet.signer);
  }, [wallet.signer, slasherAddress]);

  const loadProposerInfo = useCallback(async () => {
    if (!wallet.account || !wallet.provider || !slasherAddress) return;

    try {
      const contract = new ethers.Contract(slasherAddress, SLASHER_ABI, wallet.provider);
      
      const [
        currentBond,
        pendingWithdrawal,
        withdrawalTimestamp,
        minBondAmount,
        slashAmount,
        withdrawalDelay
      ] = await Promise.all([
        contract.getProposerBond(wallet.account),
        contract.getPendingWithdrawal(wallet.account),
        contract.getWithdrawalTimestamp(wallet.account),
        contract.MIN_BOND_AMOUNT(),
        contract.SLASH_AMOUNT(),
        contract.WITHDRAWAL_DELAY()
      ]);

      const now = Math.floor(Date.now() / 1000);
      const canWithdraw = withdrawalTimestamp > 0 && now >= withdrawalTimestamp;

      setProposerInfo({
        currentBond: ethers.formatEther(currentBond),
        pendingWithdrawal: ethers.formatEther(pendingWithdrawal),
        withdrawalTimestamp: withdrawalTimestamp.toString(),
        canWithdraw
      });

      setConstants({
        minBondAmount: ethers.formatEther(minBondAmount),
        slashAmount: ethers.formatEther(slashAmount),
        withdrawalDelay: withdrawalDelay.toString()
      });

    } catch (err) {
      console.error('Error loading proposer info:', err);
      setError('Failed to load proposer information');
    }
  }, [wallet.account, wallet.provider, slasherAddress]);

  useEffect(() => {
    loadProposerInfo();
  }, [loadProposerInfo]);

  const handleAddBond = async () => {
    if (!bondAmount || parseFloat(bondAmount) <= 0) {
      setError('Please enter a valid bond amount');
      return;
    }

    const contract = getSlasherContract();
    if (!contract) {
      setError('Contract not available');
      return;
    }

    try {
      setLoading(true);
      clearMessages();

      const value = ethers.parseEther(bondAmount);
      const tx = await contract.addBond({ value });
      
      setSuccess('Transaction submitted. Waiting for confirmation...');
      await tx.wait();
      
      setSuccess('Bond added successfully!');
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

    const contract = getSlasherContract();
    if (!contract) {
      setError('Contract not available');
      return;
    }

    try {
      setLoading(true);
      clearMessages();

      const amount = ethers.parseEther(withdrawalAmount);
      const tx = await contract.initiateWithdrawal(amount);
      
      setSuccess('Transaction submitted. Waiting for confirmation...');
      await tx.wait();
      
      setSuccess('Withdrawal initiated successfully! You can complete it after the delay period.');
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
    const contract = getSlasherContract();
    if (!contract) {
      setError('Contract not available');
      return;
    }

    try {
      setLoading(true);
      clearMessages();

      const tx = await contract.completeWithdrawal();
      
      setSuccess('Transaction submitted. Waiting for confirmation...');
      await tx.wait();
      
      setSuccess('Withdrawal completed successfully!');
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
        Please connect your wallet to manage proposer bonds.
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
        <div><strong>Your Address:</strong> 
          <span className="contract-address"> {wallet.account}</span>
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
        <h3>Your Bond Status</h3>
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
              You have {proposerInfo.pendingWithdrawal} ETH pending withdrawal.
              {proposerInfo.canWithdraw ? 
                ' You can complete the withdrawal now.' : 
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