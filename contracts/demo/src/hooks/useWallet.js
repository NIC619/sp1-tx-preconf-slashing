import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import detectEthereumProvider from '@metamask/detect-provider';
import { NETWORKS } from '../contracts';

export const useWallet = () => {
  const [account, setAccount] = useState('');
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const resetState = useCallback(() => {
    setAccount('');
    setProvider(null);
    setSigner(null);
    setChainId('');
    setIsConnected(false);
    setError('');
  }, []);

  const connectWallet = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');

      const ethereumProvider = await detectEthereumProvider();
      if (!ethereumProvider) {
        throw new Error('MetaMask not detected. Please install MetaMask.');
      }

      const accounts = await ethereumProvider.request({
        method: 'eth_requestAccounts'
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found. Please connect your wallet.');
      }

      const web3Provider = new ethers.BrowserProvider(ethereumProvider);
      const web3Signer = await web3Provider.getSigner();
      const network = await web3Provider.getNetwork();

      setAccount(accounts[0]);
      setProvider(web3Provider);
      setSigner(web3Signer);
      setChainId(`0x${network.chainId.toString(16)}`);
      setIsConnected(true);

      // Listen for account changes
      ethereumProvider.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          resetState();
        } else {
          setAccount(accounts[0]);
        }
      });

      // Listen for chain changes
      ethereumProvider.on('chainChanged', (newChainId) => {
        setChainId(newChainId);
        window.location.reload(); // Reload to reset app state
      });

    } catch (err) {
      console.error('Wallet connection error:', err);
      setError(err.message);
      resetState();
    } finally {
      setIsLoading(false);
    }
  }, [resetState]);

  const disconnectWallet = useCallback(() => {
    resetState();
  }, [resetState]);

  const switchNetwork = useCallback(async (networkName) => {
    if (!window.ethereum) {
      setError('MetaMask not detected');
      return;
    }

    const network = NETWORKS[networkName];
    if (!network) {
      setError('Network not supported');
      return;
    }

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: network.chainId }],
      });
    } catch (switchError) {
      // If network doesn't exist, add it
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [network],
          });
        } catch (addError) {
          setError('Failed to add network');
        }
      } else {
        setError('Failed to switch network');
      }
    }
  }, []);

  const getNetworkName = useCallback(() => {
    switch (chainId) {
      case '0x1':
        return 'MAINNET';
      case '0xaa36a7':
        return 'SEPOLIA';
      default:
        return 'UNKNOWN';
    }
  }, [chainId]);

  // Check if already connected on load
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const ethereumProvider = await detectEthereumProvider();
        if (ethereumProvider) {
          const accounts = await ethereumProvider.request({
            method: 'eth_accounts'
          });
          
          if (accounts.length > 0) {
            await connectWallet();
          }
        }
      } catch (err) {
        console.error('Initial connection check failed:', err);
      }
    };

    checkConnection();
  }, [connectWallet]);

  return {
    account,
    provider,
    signer,
    chainId,
    isConnected,
    isLoading,
    error,
    connectWallet,
    disconnectWallet,
    switchNetwork,
    getNetworkName,
    resetError: () => setError('')
  };
};