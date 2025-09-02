import React, { useState, useEffect } from 'react';
import { ethers, BrowserProvider } from 'ethers';
import { 
  TOKEN_ADDRESSES, 
  INTEGRATION_MANAGER_ADDRESS,
  UNISWAP_V2_EXCHANGE_ADAPTER_ADDRESS,
  COMPTROLLER_ABI,
  uniswapAdapterAbi 
} from '../constants';

interface UniswapTradeProps {
  provider: BrowserProvider;
  signer: ethers.Signer;
  account: string;
  comptrollerAddress: string;
  vaultProxyAddress: string;
  onBack: () => void;
}

interface VaultBalance {
  asvt: string;
  weth: string;
}

interface PoolReserves {
  asvtReserve: number;
  wethReserve: number;
  asvtToWethRate: number;
  wethToAsvtRate: number;
}

const UniswapTrade: React.FC<UniswapTradeProps> = ({ 
  provider,
  signer,
  comptrollerAddress, 
  vaultProxyAddress,
  onBack 
}) => {
  const [fromAmount, setFromAmount] = useState('');
  const [minAmountOut, setMinAmountOut] = useState('');
  const [fromToken, setFromToken] = useState<'ASVT' | 'WETH'>('ASVT');
  const [loading, setLoading] = useState(false);
  const [estimatedOutput, setEstimatedOutput] = useState('');
  const [poolReserves, setPoolReserves] = useState<PoolReserves | null>(null);
  const [vaultBalance, setVaultBalance] = useState<VaultBalance | null>(null);

  // 🏊 獲取 Pool 資訊和計算匯率
  const fetchPoolAndVaultInfo = async () => {
    try {
      console.log('🔍 開始獲取 Pool 和 Vault 資訊...');
      
      // 獲取 Pool 資訊
      const poolAddress = "0x9dA90247B544fF9103C5B3909dE1B87c4487ae46";
      const poolAbi = [
        'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
        'function token0() view returns (address)',
        'function token1() view returns (address)'
      ];
      
      const poolContract = new ethers.Contract(poolAddress, poolAbi, provider);
      const [reserves, token0] = await Promise.all([
        poolContract.getReserves(),
        poolContract.token0()
      ]);
      
      let asvtReserve: number, wethReserve: number;
      if (token0.toLowerCase() === TOKEN_ADDRESSES.ASVT.toLowerCase()) {
        asvtReserve = parseFloat(ethers.formatUnits(reserves[0], 18));
        wethReserve = parseFloat(ethers.formatUnits(reserves[1], 18));
      } else {
        asvtReserve = parseFloat(ethers.formatUnits(reserves[1], 18));
        wethReserve = parseFloat(ethers.formatUnits(reserves[0], 18));
      }
      
      // 計算匯率
      const asvtToWethRate = wethReserve / asvtReserve;
      const wethToAsvtRate = asvtReserve / wethReserve;
      
      setPoolReserves({
        asvtReserve,
        wethReserve, 
        asvtToWethRate,
        wethToAsvtRate
      });
      
      console.log('🏊 Pool 資訊:', { asvtReserve, wethReserve, asvtToWethRate, wethToAsvtRate });
      
      // 獲取 Vault 餘額
      const asvtContract = new ethers.Contract(TOKEN_ADDRESSES.ASVT, ['function balanceOf(address) view returns (uint256)'], provider);
      const wethContract = new ethers.Contract(TOKEN_ADDRESSES.WETH, ['function balanceOf(address) view returns (uint256)'], provider);
      
      const [asvtBalance, wethBalance] = await Promise.all([
        asvtContract.balanceOf(vaultProxyAddress),
        wethContract.balanceOf(vaultProxyAddress)
      ]);
      
      const vaultBalances = {
        asvt: ethers.formatUnits(asvtBalance, 18),
        weth: ethers.formatUnits(wethBalance, 18)
      };
      
      setVaultBalance(vaultBalances);
      console.log('🏦 Vault 餘額:', vaultBalances);
      
    } catch (error) {
      console.error('❗ 獲取資訊失敗:', error);
      // 使用測試數據
      setPoolReserves({
        asvtReserve: 5000,
        wethReserve: 0.006,
        asvtToWethRate: 0.006 / 5000,
        wethToAsvtRate: 5000 / 0.006
      });
      setVaultBalance({ asvt: '0', weth: '0' });
    }
  };

  // 💱 使用 Uniswap V2 公式計算預估輸出
  const calculateEstimatedOutput = (inputAmount: string) => {
    if (!inputAmount || !poolReserves || parseFloat(inputAmount) <= 0) {
      setEstimatedOutput('');
      return;
    }
    
    try {
      const amountIn = parseFloat(inputAmount);
      const { asvtReserve, wethReserve } = poolReserves;
      
      let outputAmount: number;
      
      if (fromToken === 'ASVT') {
        // ASVT → WETH: 使用 x*y=k 公式
        const k = asvtReserve * wethReserve;
        const newAsvtReserve = asvtReserve + amountIn;
        const newWethReserve = k / newAsvtReserve;
        outputAmount = wethReserve - newWethReserve;
        
        // 檢查是否超過可用量
        if (outputAmount >= wethReserve * 0.99) {
          setEstimatedOutput('流動性不足');
          return;
        }
      } else {
        // WETH → ASVT: 使用 x*y=k 公式
        const k = asvtReserve * wethReserve;
        const newWethReserve = wethReserve + amountIn;
        const newAsvtReserve = k / newWethReserve;
        outputAmount = asvtReserve - newAsvtReserve;
        
        // 檢查是否超過可用量
        if (outputAmount >= asvtReserve * 0.99) {
          setEstimatedOutput('流動性不足');
          return;
        }
      }
      
      if (outputAmount <= 0) {
        setEstimatedOutput('0');
        return;
      }
      
      setEstimatedOutput(outputAmount.toFixed(8));
      
      // 自動設定最小輸出 (留 2% 滑點)
      const minOutput = (outputAmount * 0.98).toFixed(8);
      setMinAmountOut(minOutput);
      
    } catch (error) {
      console.error('計算預估輸出失敗:', error);
      setEstimatedOutput('計算錯誤');
    }
  };

  // 🔄 切換交易方向
  const switchTokens = () => {
    setFromToken(prev => prev === 'ASVT' ? 'WETH' : 'ASVT');
    setFromAmount('');
    setMinAmountOut('');
    setEstimatedOutput('');
  };

  // 🔢 獲取可用餘額
  const getAvailableBalance = () => {
    if (!vaultBalance) return '0';
    return fromToken === 'ASVT' ? vaultBalance.asvt : vaultBalance.weth;
  };

  // 💼 執行交易
  const handleSwap = async () => {
    if (!fromAmount) return;

    setLoading(true);
    try {
      const amountIn = ethers.parseUnits(fromAmount, 18);
      const minAmountOutParsed = ethers.parseUnits(minAmountOut || "0", 18);

      // 根據交易方向設定路徑
      const path = fromToken === 'ASVT' 
        ? [TOKEN_ADDRESSES.ASVT, TOKEN_ADDRESSES.WETH]
        : [TOKEN_ADDRESSES.WETH, TOKEN_ADDRESSES.ASVT];
      
      const integrationData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address[]', 'uint256', 'uint256'],
        [path, amountIn, minAmountOutParsed]
      );
      
      const getFunctionSelector = (functionSignature: string) => {
        return ethers.id(functionSignature).slice(0, 10);
      };
      const takeOrderSelector = getFunctionSelector("takeOrder(address,bytes,bytes)");

      const callArgs = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bytes4', 'bytes'],
        [UNISWAP_V2_EXCHANGE_ADAPTER_ADDRESS, takeOrderSelector, integrationData]
      );

      console.log("🔄 交換:", `${fromAmount} ${fromToken} → ${fromToken === 'ASVT' ? 'WETH' : 'ASVT'}`);
      
      const comptroller = new ethers.Contract(comptrollerAddress, COMPTROLLER_ABI, signer);
      const tx = await comptroller.callOnExtension(
        INTEGRATION_MANAGER_ADDRESS,
        0,
        callArgs,
        { gasLimit: 500000 }
      );
      
      console.log("✅ 交易提交:", tx.hash);
      await tx.wait();
      alert("交易成功!");
      
      // 刷新資訊
      fetchPoolAndVaultInfo();
      
    } catch (error) {
      console.error("❌ 交易失敗:", error);
      alert(`交易失敗: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 組件載入時獲取資訊
  useEffect(() => {
    fetchPoolAndVaultInfo();
  }, [provider, vaultProxyAddress]);

  // 監聽輸入金額變化
  useEffect(() => {
    calculateEstimatedOutput(fromAmount);
  }, [fromAmount, poolReserves, fromToken]);

  const toToken = fromToken === 'ASVT' ? 'WETH' : 'ASVT';

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
                ← 返回
              </button>
              <h1 className="text-xl font-bold">Uniswap 交易 - ASVT/WETH</h1>
            </div>
          </div>
        </div>
      </div>

      {/* 主要內容 */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* 左側：交易介面 */}
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">💱 代幣交換</h2>
            
            <div className="space-y-4">
              {/* 支付代幣 */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-slate-300">
                    支付 ({fromToken})
                  </label>
                  <span className="text-xs text-slate-400">
                    可用: {parseFloat(getAvailableBalance()).toFixed(6)}
                  </span>
                </div>
                <input
                  type="number"
                  placeholder="0.0"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                
                {/* 百分比選擇按鈕 */}
                <div className="flex gap-2 mt-2">
                  {[25, 50, 75, 100].map((percentage) => (
                    <button
                      key={percentage}
                      type="button"
                      onClick={() => {
                        const balance = parseFloat(getAvailableBalance());
                        let amount;
                        if (percentage === 100) {
                          // 100% 時使用完整的可用餘額（避免精度問題）
                          amount = getAvailableBalance();
                        } else {
                          amount = (balance * percentage / 100).toFixed(fromToken === 'WETH' ? 8 : 6);
                        }
                        setFromAmount(amount);
                      }}
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-600 hover:bg-purple-600 text-slate-300 hover:text-white rounded-md transition-colors border border-slate-500 hover:border-purple-500"
                    >
                      {percentage}%
                    </button>
                  ))}
                </div>
              </div>

              {/* 切換按鈕 */}
              <div className="flex justify-center">
                <button 
                  onClick={switchTokens}
                  className="p-3 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors"
                >
                  🔄
                </button>
              </div>

              {/* 接收代幣 */}
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">
                  接收 ({toToken})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="最小接收數量"
                    value={minAmountOut}
                    onChange={(e) => setMinAmountOut(e.target.value)}
                    className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 pr-24"
                  />
                  {estimatedOutput && (
                    <div className="absolute right-3 top-3 text-sm text-green-400">
                      ≈ {estimatedOutput === '流動性不足' || estimatedOutput === '計算錯誤' 
                        ? estimatedOutput 
                        : parseFloat(estimatedOutput).toFixed(8)}
                    </div>
                  )}
                </div>
                {estimatedOutput && estimatedOutput !== '流動性不足' && estimatedOutput !== '計算錯誤' && (
                  <div className="text-xs text-slate-400 mt-2">
                    📊 預估可得: {parseFloat(estimatedOutput).toFixed(8)} {toToken}<br/>
                    🛡️ 已自動設定 2% 滑點保護
                  </div>
                )}
              </div>

              {/* 交易按鈕 */}
              <button
                onClick={handleSwap}
                disabled={
                  loading || 
                  !fromAmount || 
                  // 改善餘額檢查：允許微小誤差
                  (parseFloat(getAvailableBalance()) - parseFloat(fromAmount || '0')) < -0.00000001
                }
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {loading ? '交易中...' : `交換 ${fromToken} → ${toToken}`}
              </button>
            </div>
          </div>

          {/* 右側：Pool 和 Vault 資訊 */}
          <div className="space-y-6">
            
            {/* Pool 資訊 */}
            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4">🏊 流動性池狀態</h3>
              {poolReserves ? (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">ASVT 儲備:</span>
                    <span className="text-white font-mono">{poolReserves.asvtReserve.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">WETH 儲備:</span>
                    <span className="text-white font-mono">{poolReserves.wethReserve.toFixed(6)}</span>
                  </div>
                  <hr className="border-slate-600" />
                  <div className="flex justify-between">
                    <span className="text-slate-400">1 ASVT =</span>
                    <span className="text-green-400 font-mono">{poolReserves.asvtToWethRate.toFixed(8)} WETH</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">1 WETH =</span>
                    <span className="text-blue-400 font-mono">{poolReserves.wethToAsvtRate.toFixed(2)} ASVT</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-slate-400">載入中...</div>
              )}
            </div>

            {/* Vault 餘額 */}
            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4">🏦 金庫餘額</h3>
              {vaultBalance ? (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">ASVT:</span>
                    <span className="text-white font-mono">{parseFloat(vaultBalance.asvt).toFixed(6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">WETH:</span>
                    <span className="text-white font-mono">{parseFloat(vaultBalance.weth).toFixed(8)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-slate-400">載入中...</div>
              )}
            </div>

            {/* 交易資訊 */}
            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4">ℹ️ 交易資訊</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">交易路徑:</span>
                  <span className="text-white">{fromToken} → {toToken}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">網路:</span>
                  <span className="text-white">Sepolia Testnet</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">協議:</span>
                  <span className="text-white">Uniswap V2</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">滑點保護:</span>
                  <span className="text-white">2%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UniswapTrade;
