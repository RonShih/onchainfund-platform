import React, { useState, useEffect } from 'react';
import { ethers, BrowserProvider } from 'ethers';
import UniswapTrade from './UniswapTrade';

// SVG 圖標組件
const ArrowLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const TrendingUpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

interface SwapPageProps {
  provider: BrowserProvider;
  signer: ethers.Signer;
  account: string;
  vaultAddress?: string;
  comptrollerAddress?: string;
  vaultName?: string;
  onBack: () => void;
}

const SwapPage: React.FC<SwapPageProps> = ({ 
  provider,
  signer,
  account,
  vaultAddress, 
  comptrollerAddress,
  vaultName,
  onBack 
}) => {
  const [showTrade, setShowTrade] = useState(false);
  const [actualComptroller, setActualComptroller] = useState(comptrollerAddress);

  useEffect(() => {
    const getComptroller = async () => {
      if (!comptrollerAddress && vaultAddress && signer) {
        try {
          const vaultContract = new ethers.Contract(vaultAddress, ['function getAccessor() view returns (address)'], signer);
          const addr = await vaultContract.getAccessor();
          setActualComptroller(addr);
        } catch (error) {
          console.error('獲取 Comptroller 失敗:', error);
        }
      }
    };
    getComptroller();
  }, [comptrollerAddress, vaultAddress, signer]);
  console.log("Swap page comptrollerAddress:", comptrollerAddress);
  // 格式化地址顯示
  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (showTrade) {
    return (
      <UniswapTrade
        provider={provider}
        signer={signer}
        account={account}
        comptrollerAddress={actualComptroller}
        vaultProxyAddress={vaultAddress}
        onBack={() => setShowTrade(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* 頂部導航 */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button 
                onClick={onBack}
                className="flex items-center text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeftIcon />
                <span className="ml-2">返回金庫管理</span>
              </button>
              <div className="h-6 w-px bg-slate-600"></div>
              <h1 className="text-xl font-bold flex items-center">
                <TrendingUpIcon />
                <span className="ml-2">Uniswap 交易功能</span>
              </h1>
            </div>
            <div className="flex items-center space-x-2 text-sm text-slate-400">
              <span>當前金庫:</span>
              <span className="text-white font-mono">
                {vaultName} ({formatAddress(vaultAddress)})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 主要內容區域 */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-slate-800 rounded-lg p-8 text-center">
          <div className="mb-6">
            <div className="w-24 h-24 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Uniswap 交易功能</h2>
            <p className="text-slate-400 text-lg">即將推出</p>
          </div>
          
          <div className="bg-slate-700 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-3">預計功能</h3>
            <ul className="text-slate-300 space-y-2 text-left max-w-md mx-auto">
              <li>• ASVT ↔ WETH 交易對</li>
              <li>• 即時價格查詢</li>
              <li>• 滑點保護設定</li>
              <li>• 交易路由優化</li>
              <li>• 金庫資產管理</li>
              <li>• 交易歷史記錄</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-700 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-slate-300 mb-2">支援協議</h4>
              <div className="text-purple-400 font-bold">Uniswap V3</div>
            </div>
            <div className="bg-slate-700 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-slate-300 mb-2">交易網路</h4>
              <div className="text-blue-400 font-bold">Sepolia Testnet</div>
            </div>
            <div className="bg-slate-700 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-slate-300 mb-2">當前狀態</h4>
              <div className="text-yellow-400 font-bold">開發中</div>
            </div>
          </div>

          <button 
            onClick={() => setShowTrade(true)}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
          >
            開始交易 ASVT/WETH
          </button>
          
          <div className="text-sm text-slate-500 mt-4">
            點擊上方按鈕開始進行代幣交換...
          </div>

          {/* 開發者資訊 */}
          <div className="mt-8 p-4 bg-slate-900 rounded-lg text-left">
            <h4 className="text-sm font-bold text-slate-300 mb-2">🔧 開發者資訊</h4>
            <div className="space-y-1 text-xs text-slate-400 font-mono">
              <div>Connected Account: {formatAddress(account)}</div>
              <div>Vault Address: {formatAddress(vaultAddress)}</div>
              <div>Network: Sepolia (Chain ID: 11155111)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SwapPage;