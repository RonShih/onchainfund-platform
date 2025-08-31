import React, { useState } from 'react';
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

const UniswapTrade: React.FC<UniswapTradeProps> = ({ 
  provider,
  signer,
  comptrollerAddress, 
  vaultProxyAddress,
  onBack 
}) => {
  const [fromAmount, setFromAmount] = useState('');
  const [minAmountOut, setMinAmountOut] = useState('');
  const [fromToken, setFromToken] = useState('ASVT');
  const [loading, setLoading] = useState(false);
  const [estimatedOutput, setEstimatedOutput] = useState(''); // 新增：預估輸出
  const [poolInfo, setPoolInfo] = useState<{asvtReserve: number, wethReserve: number} | null>(null); // Pool 資訊

  const getFunctionSelector = (functionSignature: string) => {
    return ethers.id(functionSignature).slice(0, 10);
  };

  // 獲取 Pool 資訊的函數 (Uniswap V3)
  const fetchPoolInfo = async () => {
    try {
      const poolAddress = "0x9dA90247B544fF9103C5B3909dE1B87c4487ae46"; // Uniswap V3 Pool
      const poolAbi = [
        'function liquidity() view returns (uint128)',
        'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
        'function token0() view returns (address)',
        'function token1() view returns (address)',
        'function fee() view returns (uint24)'
      ];
      
      console.log('🔍 獲取 Uniswap V3 Pool 資訊...', poolAddress);
      
      const poolContract = new ethers.Contract(poolAddress, poolAbi, provider);
      const [liquidity, slot0Info, token0] = await Promise.all([
        poolContract.liquidity(),
        poolContract.slot0(),
        poolContract.token0()
      ]);
      
      console.log('📊 V3 Pool 資訊:', {
        liquidity: liquidity.toString(),
        sqrtPriceX96: slot0Info[0].toString(),
        token0: token0
      });
      
      // V3 沒有直接的 reserve，但可以用 sqrtPriceX96 計算價格
      // 暂時使用你提供的数据
      setPoolInfo({ 
        asvtReserve: 5000,
        wethReserve: 0.006 
      });
      
      console.log('✅ 使用固定 Pool 数据 (V3 計算較複雜)');
      
    } catch (error) {
      console.error('❗ 獲取 V3 Pool 資訊失敗:', error);
      
      // 使用預設值
      setPoolInfo({ asvtReserve: 5000, wethReserve: 0.006 });
    }
  };

  // 計算預估輸出的函數
  const calculateEstimatedOutput = (inputAmount: string) => {
    if (!inputAmount || !poolInfo || parseFloat(inputAmount) <= 0) {
      setEstimatedOutput('');
      return;
    }
    
    try {
      const amountIn = parseFloat(inputAmount);
      const { asvtReserve, wethReserve } = poolInfo;
      const k = asvtReserve * wethReserve;
      
      // x * y = k 公式
      const newAsvtReserve = asvtReserve + amountIn;
      const newWethReserve = k / newAsvtReserve;
      const outputAmount = wethReserve - newWethReserve;
      
      // 檢查是否超過可用量
      if (outputAmount >= wethReserve * 0.99) { // 留 1% 緩衝
        setEstimatedOutput('流動性不足');
        return;
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

  // 組件加載時獲取 Pool 資訊
  React.useEffect(() => {
    fetchPoolInfo();
  }, [provider]);

  // 監聴輸入金額變化
  React.useEffect(() => {
    calculateEstimatedOutput(fromAmount);
  }, [fromAmount, poolInfo]);

  const handleSwap = async () => {
    if (!fromAmount) return;

    setLoading(true);
    try {
      // 交易參數
      const amountIn = ethers.parseUnits(fromAmount, 18);
      const minAmountOutParsed = ethers.parseUnits(minAmountOut || "0", 18); // WETH 也是 18 位

      const path = [TOKEN_ADDRESSES.ASVT, TOKEN_ADDRESSES.WETH];
      const integrationData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address[]', 'uint256', 'uint256'],  // 正確順序：path first
        [path, amountIn, minAmountOutParsed]
      );
      
      // ✅ 修正：使用正確的函數簽名
      const getFunctionSelector = (functionSignature: string) => {
        return ethers.id(functionSignature).slice(0, 10);
      };
      const takeOrderSelector = getFunctionSelector("takeOrder(address,bytes,bytes)");

      const callArgs = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bytes4', 'bytes'],
        [UNISWAP_V2_EXCHANGE_ADAPTER_ADDRESS, takeOrderSelector, integrationData]
      );

      console.log("交換路徑:", path);
      console.log("交換金額:", amountIn.toString());
      console.log("最小輸出:", minAmountOutParsed.toString());
      console.log("IntegrationManager Calldata:", callArgs);
      console.log("comptrollerAddress:", comptrollerAddress);
      // 執行交易
      const comptroller = new ethers.Contract(comptrollerAddress, COMPTROLLER_ABI, signer);
      const tx = await comptroller.callOnExtension(
        INTEGRATION_MANAGER_ADDRESS,
        0,
        callArgs,
        { gasLimit: 500000 }
      );
      
      console.log("Transaction:", tx.hash);
      await tx.wait();
      alert("交易成功!");
      
    } catch (error) {
      console.error("交易失敗:", error);
      alert(`交易失敗: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const switchTokens = () => {
    setFromToken('ASVT');
    setFromAmount('');
    setMinAmountOut('');
  };

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

      {/* 交易介面 */}
      <div className="max-w-md mx-auto px-6 py-8">
        <div className="bg-slate-800 rounded-lg p-6 space-y-4">
          
          {/* 支付代幣 */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">
              支付 ({fromToken})
            </label>
            <input
              type="number"
              placeholder="0.0"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* 切換按鈕 */}
          <div className="flex justify-center">
            <button 
              onClick={switchTokens}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors"
            >
              ↕️
            </button>
          </div>

          {/* 接收代幣 */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">
              接收 (WETH)
            </label>
            <div className="relative">
              <input
                type="number"
                placeholder="最小接收數量"
                value={minAmountOut}
                onChange={(e) => setMinAmountOut(e.target.value)}
                className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 pr-20"
              />
              {estimatedOutput && (
                <div className="absolute right-3 top-3 text-sm text-green-400">
                  ≈ {estimatedOutput === '流動性不足' || estimatedOutput === '計算錯誤' 
                    ? estimatedOutput 
                    : parseFloat(estimatedOutput).toFixed(6)}
                </div>
              )}
            </div>
            {estimatedOutput && estimatedOutput !== '流動性不足' && estimatedOutput !== '計算錯誤' && (
              <div className="text-xs text-slate-400 mt-2">
                📊 預估可得: {parseFloat(estimatedOutput).toFixed(8)} WETH<br/>
                🛡️ 已自動設定 2% 滑點保護
              </div>
            )}
            {poolInfo && (
              <div className="text-xs text-slate-500 mt-2">
                🏊 Pool: {poolInfo.asvtReserve.toFixed(0)} ASVT + {poolInfo.wethReserve.toFixed(6)} WETH
              </div>
            )}
          </div>

          {/* 交易按鈕 */}
          <button
            onClick={handleSwap}
            disabled={loading || !fromAmount}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? '交易中...' : '交換'}
          </button>

          {/* 交易資訊 */}
          <div className="text-xs text-slate-400 space-y-1 bg-slate-700 p-3 rounded">
            <p>路徑: {fromToken} → {fromToken === 'USDC' ? 'ASVT' : 'WETH'}</p>
            <p>網路: Sepolia Testnet</p>
            <p>協議: Uniswap V2</p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default UniswapTrade;