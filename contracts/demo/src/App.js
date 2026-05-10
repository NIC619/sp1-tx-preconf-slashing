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
        <h1>Inclusion Preconfirmation Demo</h1>
        <p>Preconfirmation and Slashing Interface for Ethereum Transaction Inclusion</p>
      </div>

      {/* Wallet Status */}
      <div className="wallet-status">
        <div className="wallet-row">
          <div>
            {wallet.isConnected ? (
              <span className="wallet-connected">
                Network: {wallet.chainId && getNetworkBadge()}
              </span>
            ) : (
              <span className="wallet-disconnected">
                Wallet not connected
              </span>
            )}
          </div>
          
          <div className="wallet-actions">
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
            <li><strong>Proposer Tab:</strong> Manages the configured proposer on {wallet.getNetworkName()} network</li>
            <li><strong>User Tab:</strong> Shows the connected user wallet and requests proposer commitments</li>
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
      <div className="footer-panel">
        <h4>How it works:</h4>
        <ol style={{ paddingLeft: '20px' }}>
          <li><strong>Proposer Tab:</strong> The configured proposer deposits bonds and manages withdrawals on the slasher contract</li>
          <li><strong>User Tab - Request:</strong> Users choose a recent finalized-block case and request a proposer commitment</li>
          <li><strong>User Tab - Verify:</strong> Verify the authenticity of signed commitments using EIP-712 signature verification</li>
          <li><strong>User Tab - Check:</strong> Query the connected network to verify if transactions were included at promised positions</li>
          <li><strong>Slashing:</strong> If proposers break commitments, their bonds can be slashed as punishment</li>
        </ol>
        
        <div className="footer-note">
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
