import React from 'react';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';
import { useWallet } from './hooks/useWallet';
import ProposerTab from './components/ProposerTab';
import UserTab from './components/UserTab';

function App() {
  const wallet = useWallet();

  const getNetworkBadge = () => {
    const networkName = wallet.getNetworkName();
    const badgeClass = networkName === 'MAINNET' ? 'network-mainnet' : 
                      networkName === 'SEPOLIA' ? 'network-sepolia' : '';
    
    return (
      <span className={`network-badge ${badgeClass}`}>
        {networkName}
      </span>
    );
  };

  const switchToSepolia = () => {
    wallet.switchNetwork('SEPOLIA');
  };

  const switchToMainnet = () => {
    wallet.switchNetwork('MAINNET');
  };

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <h1>TxInclusionPreciseSlasher Demo</h1>
        <p>Preconfirmation and Slashing Interface for Ethereum Transaction Inclusion</p>
      </div>

      {/* Wallet Status */}
      <div className="wallet-status">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            {wallet.isConnected ? (
              <span className="wallet-connected">
                🟢 Connected: {wallet.account?.slice(0, 6)}...{wallet.account?.slice(-4)}
                {wallet.chainId && getNetworkBadge()}
              </span>
            ) : (
              <span className="wallet-disconnected">
                🔴 Wallet not connected
              </span>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {!wallet.isConnected ? (
              <button 
                className="connect-button" 
                onClick={wallet.connectWallet}
                disabled={wallet.isLoading}
              >
                {wallet.isLoading ? 'Connecting...' : 'Connect MetaMask'}
              </button>
            ) : (
              <>
                <button className="connect-button" onClick={switchToSepolia}>
                  Switch to Sepolia
                </button>
                <button className="connect-button" onClick={switchToMainnet}>
                  Switch to Mainnet
                </button>
                <button className="connect-button" onClick={wallet.disconnectWallet}>
                  Disconnect
                </button>
              </>
            )}
          </div>
        </div>

        {wallet.error && (
          <div className="error" style={{ marginTop: '10px' }}>
            {wallet.error}
            <button 
              style={{ marginLeft: '10px', background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
              onClick={wallet.resetError}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Network Information */}
      {wallet.isConnected && (
        <div className="contract-info">
          <strong>Important:</strong> 
          <ul style={{ margin: '10px 0', paddingLeft: '20px' }}>
            <li><strong>Proposer Tab:</strong> Manages bonds on {wallet.getNetworkName()} network (slasher contract)</li>
            <li><strong>User Tab:</strong> Commitments are always for Mainnet transactions (regardless of current network)</li>
            <li><strong>Block Queries:</strong> Always query Mainnet for transaction inclusion verification</li>
          </ul>
        </div>
      )}

      {/* Main Tabs */}
      <div className="tabs-container">
        <Tabs>
          <TabList>
            <Tab>Proposer</Tab>
            <Tab>User</Tab>
          </TabList>

          <TabPanel>
            <ProposerTab wallet={wallet} />
          </TabPanel>

          <TabPanel>
            <UserTab wallet={wallet} />
          </TabPanel>
        </Tabs>
      </div>

      {/* Footer Info */}
      <div style={{ marginTop: '40px', padding: '20px', background: '#f8f9fa', borderRadius: '10px', fontSize: '14px', color: '#6c757d' }}>
        <h4 style={{ marginTop: 0, color: '#495057' }}>How it works:</h4>
        <ol style={{ paddingLeft: '20px' }}>
          <li><strong>Proposer Tab:</strong> Block proposers deposit bonds and manage withdrawals on the slasher contract</li>
          <li><strong>User Tab - Request:</strong> Users request preconfirmations by having proposers sign EIP-712 commitments</li>
          <li><strong>User Tab - Verify:</strong> Verify the authenticity of signed commitments using EIP-712 signature verification</li>
          <li><strong>User Tab - Check:</strong> Query Ethereum mainnet to verify if transactions were included at promised positions</li>
          <li><strong>Slashing:</strong> If proposers break commitments, their bonds can be slashed as punishment</li>
        </ol>
        
        <div style={{ marginTop: '15px', padding: '10px', background: '#fff3cd', borderRadius: '5px' }}>
          <strong>⚠️ Demo Note:</strong> This is a demonstration interface. In production:
          <ul style={{ marginTop: '5px', paddingLeft: '20px' }}>
            <li>Proposers would run their own interfaces to sign commitments</li>
            <li>ZK proofs would be generated automatically for slashing</li>
            <li>The slashing mechanism would be fully integrated with the deployed contracts</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;