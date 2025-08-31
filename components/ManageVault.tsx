import React, { useState, useEffect, useCallback } from 'react';
import { ethers, BrowserProvider, isAddress, formatUnits, parseUnits } from 'ethers';
import { Input, Button } from './ui';
import { VAULT_PROXY_ABI, COMPTROLLER_ABI, ERC20_ABI, TOKEN_ADDRESSES } from '../constants';
import type { EthersError } from '../types';

interface ManageVaultProps {
    provider: BrowserProvider;
    signer: ethers.Signer;
    account: string;
    onBack: () => void;
    onNavigateToSwap?: (vaultData: {address: string, name: string, comptrollerAddress?: string}) => void;
    initialVaultAddress?: string;
}

interface TokenHolding {
  address: string;
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  price?: number;
  value?: number;
  allocation?: number;
}

interface VaultInfo {
    name: string;
    symbol: string;
    totalSupply: string;
    comptrollerAddress: string;
    denominationAsset: {
        address: string;
        symbol: string;
        decimals: number;
    };
    gav: string;
    customGav?: string; // 新增：自定義 GAV
    shareValue: string;
    customShareValue?: string; // 新增：自定義 Share Value
    userShareBalance: string;
    userDenomBalance: string;
    userAllowance: string;
}

const Spinner = () => (
    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

export default function ManageVault({ provider, signer, account, onBack, onNavigateToSwap, initialVaultAddress = '' }: ManageVaultProps) {
    const [vaultAddress, setVaultAddress] = useState(initialVaultAddress);
    const [vaultInfo, setVaultInfo] = useState<VaultInfo | null>(null);
    const [holdings, setHoldings] = useState<TokenHolding[]>([]);
    const [portfolioLoading, setPortfolioLoading] = useState(false);
    
    const [depositAmount, setDepositAmount] = useState('');
    const [redeemAmount, setRedeemAmount] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [isDepositing, setIsDepositing] = useState(false);
    const [isRedeeming, setIsRedeeming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const fetchPortfolioData = useCallback(async () => {
        if (!vaultAddress || !provider) return;
        
        setPortfolioLoading(true);
        try {
            const portfolioHoldings: TokenHolding[] = [];
            
            // 獲取主要代幣餘額
            const tokens = [
                { address: TOKEN_ADDRESSES.ASVT, symbol: 'ASVT', name: 'ASVT Token', decimals: 18 },
                { address: TOKEN_ADDRESSES.WETH, symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
                { address: TOKEN_ADDRESSES.USDC, symbol: 'USDC', name: 'USD Coin', decimals: 6 }
            ];

            for (const token of tokens) {
                try {
                    const tokenContract = new ethers.Contract(token.address, ERC20_ABI, provider);
                    const balance = await tokenContract.balanceOf(vaultAddress);
                    const balanceFormatted = formatUnits(balance, token.decimals);
                    
                    // 只顯示有餘額的代幣 (> 0.000001)
                    if (parseFloat(balanceFormatted) > 0.000001) {
                        portfolioHoldings.push({
                            ...token,
                            balance: balanceFormatted
                        });
                    }
                } catch (error) {
                    console.warn(`獲取 ${token.symbol} 餘額失敗:`, error);
                }
            }

            setHoldings(portfolioHoldings);
        } catch (error) {
            console.error('獲取 Portfolio 失敗:', error);
        } finally {
            setPortfolioLoading(false);
        }
    }, [vaultAddress, provider]);

    // 新增：獲取 Uniswap Pool 價格並計算自定義 GAV
    const calculateCustomGAV = useCallback(async (vaultAddr: string) => {
        if (!provider || !vaultAddr) return null;
        
        try {
            console.log('🔍 開始計算自定義 GAV...');
            
            // 1. 獲取金庫中的 ASVT 和 WETH 餘額
            const asvtContract = new ethers.Contract(TOKEN_ADDRESSES.ASVT, ERC20_ABI, provider);
            const wethContract = new ethers.Contract(TOKEN_ADDRESSES.WETH, ERC20_ABI, provider);
            
            const [asvtBalance, wethBalance] = await Promise.all([
                asvtContract.balanceOf(vaultAddr),
                wethContract.balanceOf(vaultAddr)
            ]);
            
            const asvtBalanceFormatted = parseFloat(formatUnits(asvtBalance, 18));
            const wethBalanceFormatted = parseFloat(formatUnits(wethBalance, 18));
            
            console.log('💰 金庫資產:', { asvtBalanceFormatted, wethBalanceFormatted });
            
            // 2. 如果只有 ASVT，直接返回
            if (wethBalanceFormatted <= 0.000001) {
                const customGav = asvtBalanceFormatted;
                console.log('✅ 只有 ASVT，GAV:', customGav);
                return {
                    customGav: customGav.toFixed(6),
                    wethPrice: 0
                };
            }
            
            // 3. 從你的 Pool 獲取 WETH 價格 (以 ASVT 計價)
            const poolAddress = "0x9dA90247B544fF9103C5B3909dE1B87c4487ae46"; // 你的正確 pool
            const poolAbi = [
                'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
                'function token0() view returns (address)',
                'function token1() view returns (address)'
            ];
            
            const poolContract = new ethers.Contract(poolAddress, poolAbi, provider);
            const [reserves, token0, token1] = await Promise.all([
                poolContract.getReserves(),
                poolContract.token0(),
                poolContract.token1()
            ]);
            
            let asvtReserve: bigint, wethReserve: bigint;
            if (token0.toLowerCase() === TOKEN_ADDRESSES.ASVT.toLowerCase()) {
                asvtReserve = reserves[0];
                wethReserve = reserves[1];
            } else {
                asvtReserve = reserves[1];
                wethReserve = reserves[0];
            }
            
            // 計算價格: 1 WETH = ? ASVT
            const asvtReserveFormatted = parseFloat(formatUnits(asvtReserve, 18));
            const wethReserveFormatted = parseFloat(formatUnits(wethReserve, 18));
            const wethPriceInASVT = asvtReserveFormatted / wethReserveFormatted;
            
            console.log('🏊 Pool 資訊:', {
                asvtReserve: asvtReserveFormatted,
                wethReserve: wethReserveFormatted,
                wethPriceInASVT
            });
            
            // 4. 計算總 GAV
            const wethValueInASVT = wethBalanceFormatted * wethPriceInASVT;
            const customGav = asvtBalanceFormatted + wethValueInASVT;
            
            console.log('✅ 自定義 GAV 計算:', {
                asvtValue: asvtBalanceFormatted,
                wethValueInASVT,
                customGav
            });
            
            return {
                customGav: customGav.toFixed(6),
                wethPrice: wethPriceInASVT
            };
            
        } catch (error) {
            console.error('😱 計算自定義 GAV 失敗:', error);
            console.warn('⚠️  Pool 地址可能不正確:', '0x9dA90247B544fF9103C5B3909dE1B87c4487ae46');
            return null;
        }
    }, [provider]);

    const fetchVaultData = useCallback(async () => {
        if (!isAddress(vaultAddress)) {
            setVaultInfo(null);
            return;
        }
        
        console.log('開始載入金庫資料:', vaultAddress);
        setIsLoading(true);
        setError(null);
        
        try {
            // 獲取 Vault 合約基本資訊
            const vaultContract = new ethers.Contract(vaultAddress, VAULT_PROXY_ABI, provider);
            
            const [compAddress, vaultName, vaultSymbol, totalSupply] = await Promise.all([
                vaultContract.getAccessor(),
                vaultContract.name(),
                vaultContract.symbol(),
                vaultContract.totalSupply()
            ]);
            
            console.log('Vault 基本資訊:', { compAddress, vaultName, vaultSymbol });

            // 獲取 Comptroller 資訊 - 增加錯誤處理
            const comptrollerContract = new ethers.Contract(compAddress, COMPTROLLER_ABI, provider);
            let denomAddress, gavBN, shareValueBN;
            
            try {
                [denomAddress, gavBN, shareValueBN] = await Promise.all([
                    comptrollerContract.getDenominationAsset(),
                    comptrollerContract.calcGav(),
                    comptrollerContract.calcGrossShareValue()
                ]);
            } catch (calcError) {
                console.warn('計算 GAV/ShareValue 失敗，使用預設值:', calcError);
                denomAddress = await comptrollerContract.getDenominationAsset();
                gavBN = 0n; // 預設值
                shareValueBN = ethers.parseUnits('1', 18); // 預設為 1
            }
            
            console.log('計價資產地址:', denomAddress);
            
            // 獲取計價資產資訊
            const erc20Contract = new ethers.Contract(denomAddress, ERC20_ABI, provider);
            const [denomSymbol, denomDecimals] = await Promise.all([
                erc20Contract.symbol(),
                erc20Contract.decimals()
            ]);
            
            console.log('計價資產資訊:', { denomSymbol, denomDecimals });
            
            // 獲取用戶相關資料
            const [userDenomBN, userShareBN, userAllowanceBN] = await Promise.all([
                erc20Contract.balanceOf(account),
                vaultContract.balanceOf(account),
                erc20Contract.allowance(account, compAddress)
            ]);
            
            const vaultData: VaultInfo = {
                name: vaultName,
                symbol: vaultSymbol,
                totalSupply: formatUnits(totalSupply, 18),
                comptrollerAddress: compAddress,
                denominationAsset: {
                    address: denomAddress,
                    symbol: denomSymbol,
                    decimals: Number(denomDecimals)
                },
                gav: formatUnits(gavBN, denomDecimals),
                shareValue: formatUnits(shareValueBN, 18),
                userShareBalance: formatUnits(userShareBN, 18),
                userDenomBalance: formatUnits(userDenomBN, denomDecimals),
                userAllowance: formatUnits(userAllowanceBN, denomDecimals)
            };
            
            // 計算自定義 GAV
            const customGavResult = await calculateCustomGAV(vaultAddress);
            if (customGavResult) {
                vaultData.customGav = customGavResult.customGav;
                // 計算自定義 Share Value = Custom GAV / Total Supply
                const totalSupplyNum = parseFloat(formatUnits(totalSupply, 18));
                if (totalSupplyNum > 0) {
                    const customShareValue = parseFloat(customGavResult.customGav) / totalSupplyNum;
                    vaultData.customShareValue = customShareValue.toFixed(6);
                }
            }
            
            console.log('完整金庫資料:', vaultData);
            setVaultInfo(vaultData);

        } catch (err) {
            console.error("獲取金庫資料失敗:", err);
            const error = err as EthersError;
            setError(`無法載入金庫資料: ${error.reason || error.message || '請確認地址正確且連接到 Sepolia 網路'}`);
            setVaultInfo(null);
        }
        setIsLoading(false);
    }, [vaultAddress, provider, account, calculateCustomGAV]);

    // 當 initialVaultAddress 改變時更新 vaultAddress
    useEffect(() => {
        if (initialVaultAddress && initialVaultAddress !== vaultAddress) {
            setVaultAddress(initialVaultAddress);
        }
    }, [initialVaultAddress]);

    useEffect(() => {
        if (vaultAddress) {
            fetchVaultData();
            fetchPortfolioData();
        }
    }, [fetchVaultData, fetchPortfolioData]);

    const handleApprove = async () => {
        if (!vaultInfo || !depositAmount) return;
        
        console.log('開始批准操作...');
        setIsApproving(true);
        setError(null);
        setMessage(null);
        
        try {
            const amountToApprove = parseUnits(depositAmount, vaultInfo.denominationAsset.decimals);
            const erc20Contract = new ethers.Contract(vaultInfo.denominationAsset.address, ERC20_ABI, signer);
            
            // 檢查當前授權額度
            const currentAllowance = parseUnits(vaultInfo.userAllowance, vaultInfo.denominationAsset.decimals);
            
            if (currentAllowance >= amountToApprove) {
                setMessage("授權額度已足夠，可以直接進行存款！");
                setIsApproving(false);
                return;
            }
            
            console.log('發送授權交易:', {
                spender: vaultInfo.comptrollerAddress,
                amount: amountToApprove.toString()
            });
            
            const tx = await erc20Contract.approve(vaultInfo.comptrollerAddress, amountToApprove);
            console.log('授權交易發送:', tx.hash);
            
            await tx.wait();
            console.log('授權交易確認完成');
            
            setMessage(`授權成功！您現在可以存款 ${depositAmount} ${vaultInfo.denominationAsset.symbol}`);
            
            // 重新載入數據以更新授權額度
            fetchVaultData();
            
        } catch (e) {
            const err = e as EthersError;
            console.error('授權失敗:', err);
            setError(`授權失敗: ${err.reason || err.message || '未知錯誤'}`);
        }
        setIsApproving(false);
    };

    const handleDeposit = async () => {
        if (!vaultInfo || !depositAmount) return;
        
        console.log('開始存款操作...');
        setIsDepositing(true);
        setError(null);
        setMessage(null);
        
        try {
            const amountToDeposit = parseUnits(depositAmount, vaultInfo.denominationAsset.decimals);
            const comptrollerContract = new ethers.Contract(vaultInfo.comptrollerAddress, COMPTROLLER_ABI, signer);
            
            // 計算期望得到的股份數量
            const shareValueBN = parseUnits(vaultInfo.shareValue, 18);
            const expectedShares = amountToDeposit * parseUnits("1", 18) / shareValueBN;
            
            // 設置最小股份數量為期望股份的 99%（允許 1% 滑點）
            const minSharesQuantity = expectedShares * 99n / 100n;
            
            // 確保 minSharesQuantity 至少為 1 wei
            const finalMinShares = minSharesQuantity > 0n ? minSharesQuantity : 1n;
            
            console.log('發送存款交易:', {
                amount: amountToDeposit.toString(),
                expectedShares: expectedShares.toString(),
                minShares: finalMinShares.toString()
            });
            
            // 估算 gas
            const gasEstimate = await comptrollerContract.buyShares.estimateGas(amountToDeposit, finalMinShares);
            console.log('Gas 估算:', gasEstimate.toString());
            
            const tx = await comptrollerContract.buyShares(amountToDeposit, finalMinShares, {
                gasLimit: gasEstimate * 120n / 100n // 增加 20% 緩衝
            });
            
            console.log('存款交易發送:', tx.hash);
            await tx.wait();
            console.log('存款交易確認完成');
            
            setMessage(`成功存款 ${depositAmount} ${vaultInfo.denominationAsset.symbol}！`);
            setDepositAmount('');
            
            // 重新載入數據
            fetchVaultData();
            fetchPortfolioData();
            
        } catch (e) {
            const err = e as EthersError;
            console.error('存款失敗:', err);
            
            // 更詳細的錯誤處理
            let errorMessage = '未知錯誤';
            if (err.reason) {
                errorMessage = err.reason;
            } else if (err.message) {
                if (err.message.includes('_minSharesQuantity must be >0')) {
                    errorMessage = '最小股份數量計算錯誤，請稍後重試';
                } else if (err.message.includes('insufficient allowance')) {
                    errorMessage = '授權額度不足，請先進行授權';
                } else if (err.message.includes('insufficient balance')) {
                    errorMessage = '餘額不足';
                } else {
                    errorMessage = err.message;
                }
            }
            
            setError(`存款失敗: ${errorMessage}`);
        }
        setIsDepositing(false);
    };
    
    const handleRedeem = async () => {
        if (!vaultInfo || !redeemAmount) return;
        
        console.log('開始贖回操作...');
        setIsRedeeming(true);
        setError(null);
        setMessage(null);
        
        try {
            const sharesToRedeem = parseUnits(redeemAmount, 18); // 股份通常是 18 位小數
            const comptrollerContract = new ethers.Contract(vaultInfo.comptrollerAddress, COMPTROLLER_ABI, signer);
            
            console.log('發送贖回交易:', {
                recipient: account,
                shares: sharesToRedeem.toString()
            });
            
            // 估算 gas
            const gasEstimate = await comptrollerContract.redeemSharesInKind.estimateGas(
                account, 
                sharesToRedeem, 
                [], 
                []
            );
            console.log('Gas 估算:', gasEstimate.toString());
            
            const tx = await comptrollerContract.redeemSharesInKind(
                account, 
                sharesToRedeem, 
                [], 
                [],
                {
                    gasLimit: gasEstimate * 120n / 100n // 增加 20% 緩衝
                }
            );
            
            console.log('贖回交易發送:', tx.hash);
            await tx.wait();
            console.log('贖回交易確認完成');
            
            setMessage(`成功贖回 ${redeemAmount} 股份！`);
            setRedeemAmount('');
            
            // 重新載入數據
            fetchVaultData();
            fetchPortfolioData();
            
        } catch(e) {
            const err = e as EthersError;
            console.error('贖回失敗:', err);
            setError(`贖回失敗: ${err.reason || err.message || '未知錯誤'}`);
        }
        setIsRedeeming(false);
    };

    const setMaxDeposit = () => {
        if (vaultInfo) {
            setDepositAmount(vaultInfo.userDenomBalance);
        }
    };

    const setMaxRedeem = () => {
        if (vaultInfo) {
            setRedeemAmount(vaultInfo.userShareBalance);
        }
    };

    return (
        <div>
            <div className="bg-slate-850 p-8 rounded-xl border border-slate-700 max-w-6xl mx-auto">
                <button onClick={onBack} className="text-sm text-slate-400 hover:text-white mb-6">&larr; 返回首頁</button>
                <h2 className="text-3xl font-bold text-white mb-6">💰 管理現有金庫</h2>

                <div className="mb-8">
                    <Input
                        label="金庫代理地址 (Vault Proxy Address)"
                        value={vaultAddress}
                        onChange={(e) => setVaultAddress(e.target.value)}
                        placeholder="輸入金庫地址，例如: 0x..."
                        description="輸入您想要投資或管理的金庫地址"
                    />
                </div>

                {isLoading && (
                    <div className="mt-4 text-center flex items-center justify-center">
                        <Spinner />
                        <span className="text-slate-400">正在載入金庫資料...</span>
                    </div>
                )}

                {error && (
                    <div className="mt-4 p-4 bg-red-900/50 text-red-300 border border-red-700 rounded-lg">
                        ❌ {error}
                    </div>
                )}

                {message && (
                    <div className="mt-4 p-4 bg-green-900/50 text-green-300 border border-green-700 rounded-lg">
                        ✅ {message}
                    </div>
                )}

                {vaultInfo && (
                    <div className="mt-8 space-y-8">
                        {/* 金庫資訊總覽 */}
                        <div className="bg-slate-900 p-6 rounded-lg">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-bold text-white">📊 金庫資訊</h3>
                                {onNavigateToSwap && (
                                    <button
                                        onClick={() => onNavigateToSwap({address: vaultAddress, name: vaultInfo.name, comptrollerAddress: vaultInfo.comptrollerAddress})}
                                        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center"
                                    >
                                        🔄 Uniswap
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="text-center">
                                    <div className="text-sm text-slate-400">基金名稱</div>
                                    <div className="text-lg font-bold text-white">{vaultInfo.name}</div>
                                    <div className="text-xs text-slate-500">{vaultInfo.symbol}</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-sm text-slate-400">總資產價值 (GAV)</div>
                                    <div className="text-lg font-bold text-emerald-400">
                                        {vaultInfo.customGav ? (
                                            <>
                                                <span className="text-green-300">{vaultInfo.customGav}</span>
                                                <span className="text-xs text-slate-500 ml-2">(自定義)</span>
                                            </>
                                        ) : (
                                            <span className="text-red-400">計算失敗</span>
                                        )}
                                        <div className="text-xs text-slate-500 mt-1">
                                            原始: {parseFloat(vaultInfo.gav).toFixed(4)} {vaultInfo.denominationAsset.symbol}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-sm text-slate-400">股份價值</div>
                                    <div className="text-lg font-bold text-blue-400">
                                        {vaultInfo.customShareValue ? (
                                            <>
                                                <span className="text-blue-300">{vaultInfo.customShareValue}</span>
                                                <span className="text-xs text-slate-500 ml-2">(自定義)</span>
                                            </>
                                        ) : (
                                            <span>{parseFloat(vaultInfo.shareValue).toFixed(6)}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-sm text-slate-400">總股份</div>
                                    <div className="text-lg font-bold text-white">
                                        {parseFloat(vaultInfo.totalSupply).toFixed(4)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 新增：Portfolio 資產組合 */}
                        <div className="bg-slate-900 p-6 rounded-lg">
                            <h3 className="text-xl font-bold text-white mb-4">📊 資產組合 (Token Holdings)</h3>
                            
                            {portfolioLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                                    <span className="ml-2 text-slate-400">載入中...</span>
                                </div>
                            ) : holdings.length === 0 ? (
                                <div className="text-center py-8 text-slate-400">
                                    <p>暫無資產持有記錄</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {holdings.map((holding, index) => (
                                        <div key={holding.address} className="flex items-center justify-between p-4 bg-slate-800 rounded-lg">
                                            <div className="flex items-center space-x-3">
                                                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                                                    <span className="text-white font-bold text-sm">
                                                        {holding.symbol.charAt(0)}
                                                    </span>
                                                </div>
                                                <div>
                                                    <div className="text-white font-semibold">{holding.symbol}</div>
                                                    <div className="text-sm text-slate-400">{holding.name}</div>
                                                </div>
                                            </div>
                                            
                                            <div className="text-right">
                                                <div className="text-white font-semibold">
                                                    {parseFloat(holding.balance).toFixed(holding.decimals === 18 ? 6 : 2)}
                                                </div>
                                                <div className="text-sm text-slate-400">
                                                    Balance
                                                </div>
                                            </div>
                                            
                                            <div className="text-right">
                                                <div className="text-purple-400 font-semibold">
                                                    {((parseFloat(holding.balance) / holdings.reduce((sum, h) => sum + parseFloat(h.balance), 0)) * 100).toFixed(1)}%
                                                </div>
                                                <div className="text-sm text-slate-400">
                                                    Allocation*
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    <div className="mt-4 p-4 bg-gradient-to-r from-green-900/20 to-blue-900/20 border border-green-700/30 rounded-lg">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-slate-300">總持有代幣:</span>
                                            <span className="text-green-400 font-bold">{holdings.length} 種類</span>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-2">
                                            <p>* Allocation 為簡化計算，不同代幣單位不同</p>
                                            <p>💵 需要 Price Feed 才能顯示真實價值分配</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 原有的用戶資產資訊 */}
                        <div className="bg-slate-900 p-6 rounded-lg">
                            <h3 className="text-xl font-bold text-white mb-4">👤 您的資產</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="text-center">
                                    <div className="text-sm text-slate-400">您的股份</div>
                                    <div className="text-2xl font-bold text-purple-400">
                                        {parseFloat(vaultInfo.userShareBalance).toFixed(6)}
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-sm text-slate-400">您的 {vaultInfo.denominationAsset.symbol} 餘額</div>
                                    <div className="text-2xl font-bold text-green-400">
                                        {parseFloat(vaultInfo.userDenomBalance).toFixed(6)}
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-sm text-slate-400">已授權額度</div>
                                    <div className="text-2xl font-bold text-orange-400">
                                        {parseFloat(vaultInfo.userAllowance).toFixed(6)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* 存款區域 */}
                            <div className="bg-gradient-to-br from-green-900/20 to-emerald-900/20 p-6 rounded-lg border border-green-700/30">
                                <h3 className="text-xl font-bold text-green-400 mb-4">💳 存款 {vaultInfo.denominationAsset.symbol}</h3>
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-sm font-medium text-slate-300">存款金額</label>
                                            <button 
                                                onClick={setMaxDeposit}
                                                className="text-xs text-green-400 hover:text-green-300 underline"
                                            >
                                                最大值
                                            </button>
                                        </div>
                                        <Input 
                                            value={depositAmount} 
                                            onChange={e => setDepositAmount(e.target.value)} 
                                            type="number" 
                                            step="0.000001"
                                            placeholder="0.0"
                                            className="text-center text-lg"
                                        />
                                        <div className="text-xs text-slate-400 mt-1">
                                            可用餘額: {parseFloat(vaultInfo.userDenomBalance).toFixed(6)} {vaultInfo.denominationAsset.symbol}
                                        </div>
                                    </div>
                                    
                                    <div className="flex space-x-2">
                                        <Button 
                                            onClick={handleApprove} 
                                            disabled={isApproving || !depositAmount || parseFloat(depositAmount) <= 0}
                                            className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                                        >
                                            {isApproving && <Spinner/>} 
                                            1️⃣ 授權
                                        </Button>
                                        <Button 
                                            onClick={handleDeposit} 
                                            disabled={isDepositing || !depositAmount || parseFloat(depositAmount) <= 0}
                                            className="flex-1 bg-green-600 hover:bg-green-700"
                                        >
                                            {isDepositing && <Spinner/>} 
                                            2️⃣ 存款
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* 贖回區域 */}
                            <div className="bg-gradient-to-br from-red-900/20 to-pink-900/20 p-6 rounded-lg border border-red-700/30">
                                <h3 className="text-xl font-bold text-red-400 mb-4">🏦 贖回股份</h3>
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-sm font-medium text-slate-300">贖回股份數量</label>
                                            <button 
                                                onClick={setMaxRedeem}
                                                className="text-xs text-red-400 hover:text-red-300 underline"
                                            >
                                                全部贖回
                                            </button>
                                        </div>
                                        <Input 
                                            value={redeemAmount} 
                                            onChange={e => setRedeemAmount(e.target.value)} 
                                            type="number" 
                                            step="0.000001"
                                            placeholder="0.0"
                                            className="text-center text-lg"
                                        />
                                        <div className="text-xs text-slate-400 mt-1">
                                            您的股份: {parseFloat(vaultInfo.userShareBalance).toFixed(6)}
                                        </div>
                                    </div>
                                    
                                    <Button 
                                        onClick={handleRedeem} 
                                        disabled={isRedeeming || !redeemAmount || parseFloat(redeemAmount) <= 0}
                                        className="w-full bg-red-600 hover:bg-red-700"
                                    >
                                        {isRedeeming && <Spinner/>} 
                                        💸 贖回股份
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* 地址資訊 */}
                        <div className="bg-slate-900 p-4 rounded-lg">
                            <h4 className="text-sm font-bold text-slate-300 mb-2">📝 合約地址</h4>
                            <div className="space-y-2 text-xs font-mono">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Vault:</span>
                                    <a 
                                        href={`https://sepolia.etherscan.io/address/${vaultAddress}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300 underline"
                                    >
                                        {vaultAddress}
                                    </a>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Comptroller:</span>
                                    <a 
                                        href={`https://sepolia.etherscan.io/address/${vaultInfo.comptrollerAddress}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300 underline"
                                    >
                                        {vaultInfo.comptrollerAddress}
                                    </a>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">{vaultInfo.denominationAsset.symbol}:</span>
                                    <a 
                                        href={`https://sepolia.etherscan.io/address/${vaultInfo.denominationAsset.address}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300 underline"
                                    >
                                        {vaultInfo.denominationAsset.address}
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}