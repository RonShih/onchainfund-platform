import React, { useState, useEffect, useCallback } from 'react';
import { ethers, BrowserProvider } from 'ethers';
import CreateVaultForm from './components/CreateVaultForm';
import ManageVault from './components/ManageVault';
import { Card } from './components/ui';
import type { EthersError } from './types';

// 擴展 Window 接口以包含 ethereum
declare global {
    interface Window {
        ethereum?: any;
    }
}

const WalletIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3-3v8a3 3 0 003 3z" />
    </svg>
);

export default function App() {
    const [account, setAccount] = useState<string | null>(null);
    const [provider, setProvider] = useState<BrowserProvider | null>(null);
    const [signer, setSigner] = useState<ethers.Signer | null>(null);
    const [view, setView] = useState<'home' | 'create' | 'manage'>('home');
    const [pendingView, setPendingView] = useState<'create' | 'manage' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const connectWallet = useCallback(async () => {
        console.log('開始連接錢包...');
        setIsLoading(true);
        setError(null);
        
        // 檢查 MetaMask 是否安裝
        if (typeof window.ethereum === 'undefined') {
            console.error('MetaMask 未安裝');
            setError("MetaMask is not installed. Please install it to use this app.");
            setIsLoading(false);
            return;
        }

        // 檢查是否為 MetaMask
        if (!window.ethereum.isMetaMask) {
            console.error('不是 MetaMask');
            setError("Please use MetaMask wallet.");
            setIsLoading(false);
            return;
        }

        try {
            console.log('請求帳戶權限...');
            
            // 首先請求帳戶訪問權限
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            });

            if (accounts.length === 0) {
                throw new Error('用戶拒絕連接錢包');
            }

            console.log('帳戶獲取成功:', accounts[0]);

            // 檢查網路
            const chainId = await window.ethereum.request({
                method: 'eth_chainId'
            });
            
            console.log('當前網路 ID:', chainId);
            
            // Sepolia 測試網的 Chain ID 是 0xaa36a7 (11155111)
            const sepoliaChainId = '0xaa36a7';
            
            if (chainId !== sepoliaChainId) {
                console.log('切換到 Sepolia 測試網...');
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: sepoliaChainId }],
                    });
                } catch (switchError: any) {
                    // 如果 Sepolia 網路沒有添加，則添加它
                    if (switchError.code === 4902) {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: sepoliaChainId,
                                chainName: 'Sepolia Testnet',
                                rpcUrls: ['https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161'],
                                nativeCurrency: {
                                    name: 'Sepolia ETH',
                                    symbol: 'SEP',
                                    decimals: 18,
                                },
                                blockExplorerUrls: ['https://sepolia.etherscan.io/'],
                            }],
                        });
                    } else {
                        throw switchError;
                    }
                }
            }

            // 創建 provider 和 signer
            console.log('創建 provider...');
            const web3Provider = new BrowserProvider(window.ethereum);
            const web3Signer = await web3Provider.getSigner();
            const connectedAccount = await web3Signer.getAddress();
            
            console.log('錢包連接成功！地址:', connectedAccount);

            // 再次檢查網路（以防切換後的狀態）
            const network = await web3Provider.getNetwork();
            console.log('網路資訊:', network);
            
            if (network.chainId !== 11155111n) { // Sepolia Chain ID
                setError("Please connect to the Sepolia test network.");
                setIsLoading(false);
                return;
            }

            setProvider(web3Provider);
            setSigner(web3Signer);
            setAccount(connectedAccount);
            
            if (pendingView) {
                setView(pendingView);
                setPendingView(null);
            }

            console.log('連接完成，狀態已更新');

        } catch (err) {
            const e = err as EthersError;
            console.error("錢包連接失敗:", e);
            
            let errorMessage = "Failed to connect wallet. Please try again.";
            
            if (e.code === 'ACTION_REJECTED' || e.code === 4001) {
                errorMessage = "Wallet connection request was rejected.";
            } else if (e.code === -32002) {
                errorMessage = "MetaMask already has a pending request. Please open MetaMask and handle the request.";
            } else if (e.message?.includes('User denied')) {
                errorMessage = "User denied the connection request.";
            } else if (e.reason) {
                errorMessage = e.reason;
            } else if (e.message) {
                errorMessage = e.message;
            }
            
            setError(errorMessage);
        }
        setIsLoading(false);
    }, [pendingView]);
    
    // 檢查初始連接狀態
    useEffect(() => {
        const checkConnection = async () => {
            if (window.ethereum) {
                try {
                    const accounts = await window.ethereum.request({ 
                        method: 'eth_accounts' 
                    });
                    
                    if (accounts.length > 0) {
                        console.log('檢測到已連接的帳戶:', accounts[0]);
                        // 自動重新連接
                        const web3Provider = new BrowserProvider(window.ethereum);
                        const web3Signer = await web3Provider.getSigner();
                        const connectedAccount = await web3Signer.getAddress();
                        
                        setProvider(web3Provider);
                        setSigner(web3Signer);
                        setAccount(connectedAccount);
                    }
                } catch (error) {
                    console.error('檢查連接狀態失敗:', error);
                }
            }
        };

        checkConnection();
    }, []);
    
    // Set up event listeners for wallet changes
    useEffect(() => {
        if (window.ethereum) {
            const handleAccountsChanged = (accounts: string[]) => {
                console.log('帳戶變更:', accounts);
                if (accounts.length === 0) {
                    // MetaMask is locked or the user has disconnected.
                    setAccount(null);
                    setSigner(null);
                    setProvider(null);
                    setView('home');
                    setError("Wallet disconnected. Please connect again.");
                } else if (accounts[0] !== account) {
                    setAccount(accounts[0]);
                    if (provider) {
                        provider.getSigner().then(setSigner);
                    }
                }
            };

            const handleChainChanged = (chainId: string) => {
                console.log('網路變更:', chainId);
                // EIP-1193 recommends reloading the page on chain change.
                window.location.reload();
            };
            
            const eth = window.ethereum as any;
            eth.on('accountsChanged', handleAccountsChanged);
            eth.on('chainChanged', handleChainChanged);

            return () => {
                eth.removeListener('accountsChanged', handleAccountsChanged);
                eth.removeListener('chainChanged', handleChainChanged);
            };
        }
    }, [account, provider]);

    const handleNavigation = (targetView: 'create' | 'manage') => {
        console.log('導航到:', targetView);
        if (account && provider) {
            setView(targetView);
        } else {
            if (!isLoading) {
                setPendingView(targetView);
                connectWallet();
            }
        }
    };

    const Header = () => (
        <header className="p-4 border-b border-slate-700 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-white cursor-pointer" onClick={() => setView('home')}>
                OnChainFund
            </h1>
            <div>
                {account ? (
                    <div className="flex items-center bg-slate-800 p-2 rounded-lg">
                        <WalletIcon />
                        <span className="font-mono text-white">{`${account.substring(0, 6)}...${account.substring(account.length - 4)}`}</span>
                    </div>
                ) : (
                    <button
                        onClick={() => {
                            console.log('連接錢包按鈕被點擊');
                            connectWallet();
                        }}
                        disabled={isLoading}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg flex items-center transition-colors"
                    >
                        {isLoading ? 'Connecting...' : 'Connect Wallet'}
                    </button>
                )}
            </div>
        </header>
    );

    const Home = () => (
        <div className="text-center p-8">
            <h2 className="text-4xl font-extrabold text-white mb-4">Welcome to the Future of Funds</h2>
            <p className="text-slate-400 max-w-2xl mx-auto mb-12">
                Create your own decentralized investment vault or manage your deposits in existing funds. All on-chain, secure, and transparent.
            </p>
            {error && <div className="bg-red-900/50 border border-red-700 text-red-300 p-3 rounded-lg mb-8 max-w-md mx-auto">{error}</div>}
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                <Card
                    title="Create Your Vault"
                    description="Become a fund manager. Set up your vault's strategy, fees, and policies in a few simple steps."
                    onClick={() => handleNavigation('create')}
                />
                 <Card
                    title="Manage Existing Vault"
                    description="For investors. Deposit assets into a vault, track performance, and redeem your shares."
                    onClick={() => handleNavigation('manage')}
                />
            </div>
        </div>
    );

    const renderView = () => {
        if (!account || !provider || !signer) {
            return <Home />;
        }
        
        switch (view) {
            case 'create':
                return <CreateVaultForm provider={provider} signer={signer} account={account} onBack={() => setView('home')} />;
            case 'manage':
                return <ManageVault provider={provider} signer={signer} account={account} onBack={() => setView('home')} />;
            case 'home':
            default:
                return <Home />;
        }
    };

    return (
        <div className="min-h-screen bg-dark-blue">
            <Header />
            <main className="container mx-auto px-4 py-8">
                {renderView()}
            </main>
        </div>
    );
}
