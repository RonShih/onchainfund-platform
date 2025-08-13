import React, { useState, useEffect } from 'react';
import { ethers, BrowserProvider } from 'ethers';
import { Button } from './ui';
import { FUND_FACTORY_ADDRESS, FUND_FACTORY_ABI, VAULT_PROXY_ABI, COMPTROLLER_ABI, ERC20_ABI } from '../constants';
import type { EthersError } from '../types';

interface FundInfo {
    vaultAddress: string;
    comptrollerAddress: string;
    name: string;
    symbol: string;
    denominationAsset: {
        address: string;
        symbol: string;
        decimals: number;
    };
    totalSupply: string;
    gav: string;
    shareValue: string;
    creator: string;
    blockNumber: number;
}

interface FundListProps {
    provider: BrowserProvider;
    onSelectFund: (vaultAddress: string) => void;
}

const Spinner = () => (
    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

export default function FundList({ provider, onSelectFund }: FundListProps) {
    const [funds, setFunds] = useState<FundInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchFunds = async () => {
        console.log('開始獲取基金列表...');
        setIsLoading(true);
        setError(null);
        
        try {
            const factory = new ethers.Contract(FUND_FACTORY_ADDRESS, FUND_FACTORY_ABI, provider);
            
            // 獲取 NewFundCreated 事件
            console.log('查詢 NewFundCreated 事件...');
            const filter = factory.filters.NewFundCreated();
            
            // 從最近的 10000 個區塊中查詢（可以根據需要調整）
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 10000);
            
            console.log(`查詢區塊範圍: ${fromBlock} - ${currentBlock}`);
            
            const events = await factory.queryFilter(filter, fromBlock, currentBlock);
            console.log(`找到 ${events.length} 個基金創建事件`);
            
            const fundPromises = events.map(async (event, index) => {
                try {
                    console.log(`處理基金 ${index + 1}/${events.length}...`);
                    
                    const { creator, vaultProxy, comptrollerProxy } = event.args;
                    
                    // 獲取 Vault 基本資訊
                    const vaultContract = new ethers.Contract(vaultProxy, VAULT_PROXY_ABI, provider);
                    const [name, symbol, totalSupply] = await Promise.all([
                        vaultContract.name(),
                        vaultContract.symbol(),
                        vaultContract.totalSupply()
                    ]);
                    
                    // 獲取 Comptroller 資訊
                    const comptrollerContract = new ethers.Contract(comptrollerProxy, COMPTROLLER_ABI, provider);
                    const [denomAddress, gav, shareValue] = await Promise.all([
                        comptrollerContract.getDenominationAsset(),
                        comptrollerContract.calcGav(),
                        comptrollerContract.calcGrossShareValue()
                    ]);
                    
                    // 獲取計價資產資訊
                    const erc20Contract = new ethers.Contract(denomAddress, ERC20_ABI, provider);
                    const [denomSymbol, denomDecimals] = await Promise.all([
                        erc20Contract.symbol(),
                        erc20Contract.decimals()
                    ]);
                    
                    const fundInfo: FundInfo = {
                        vaultAddress: vaultProxy,
                        comptrollerAddress: comptrollerProxy,
                        name,
                        symbol,
                        denominationAsset: {
                            address: denomAddress,
                            symbol: denomSymbol,
                            decimals: Number(denomDecimals)
                        },
                        totalSupply: ethers.formatUnits(totalSupply, 18),
                        gav: ethers.formatUnits(gav, denomDecimals),
                        shareValue: ethers.formatUnits(shareValue, 18),
                        creator,
                        blockNumber: event.blockNumber
                    };
                    
                    console.log(`基金資訊載入完成: ${name} (${symbol})`);
                    return fundInfo;
                    
                } catch (err) {
                    console.error(`載入基金 ${index + 1} 失敗:`, err);
                    return null;
                }
            });
            
            const results = await Promise.all(fundPromises);
            const validFunds = results.filter((fund): fund is FundInfo => fund !== null);
            
            // 按創建時間排序（最新的在前）
            validFunds.sort((a, b) => b.blockNumber - a.blockNumber);
            
            console.log(`成功載入 ${validFunds.length} 個基金`);
            setFunds(validFunds);
            
        } catch (err) {
            console.error('獲取基金列表失敗:', err);
            const error = err as EthersError;
            setError(`無法載入基金列表: ${error.reason || error.message || '未知錯誤'}`);
        }
        
        setIsLoading(false);
    };

    useEffect(() => {
        fetchFunds();
    }, [provider]);

    return (
        <div className="bg-slate-850 p-6 rounded-xl border border-slate-700">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-white">🌟 可用基金列表</h3>
                <Button onClick={fetchFunds} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
                    {isLoading && <Spinner />}
                    刷新列表
                </Button>
            </div>
            
            {error && (
                <div className="mb-6 p-4 bg-red-900/50 text-red-300 border border-red-700 rounded-lg">
                    ❌ {error}
                </div>
            )}
            
            {isLoading && (
                <div className="text-center py-8">
                    <Spinner />
                    <p className="text-slate-400 mt-2">正在載入基金列表...</p>
                </div>
            )}
            
            {!isLoading && funds.length === 0 && !error && (
                <div className="text-center py-8">
                    <div className="text-6xl mb-4">📭</div>
                    <p className="text-slate-400 text-lg">尚無可用基金</p>
                    <p className="text-slate-500 text-sm mt-2">
                        請先創建基金或稍後再試
                    </p>
                </div>
            )}
            
            {!isLoading && funds.length > 0 && (
                <div className="space-y-4">
                    {funds.map((fund, index) => (
                        <FundCard 
                            key={fund.vaultAddress} 
                            fund={fund} 
                            index={index}
                            onSelect={() => onSelectFund(fund.vaultAddress)} 
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface FundCardProps {
    fund: FundInfo;
    index: number;
    onSelect: () => void;
}

const FundCard: React.FC<FundCardProps> = ({ fund, index, onSelect }) => {
    const gavNumber = parseFloat(fund.gav);
    const shareValueNumber = parseFloat(fund.shareValue);
    const totalSupplyNumber = parseFloat(fund.totalSupply);
    
    return (
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 p-6 rounded-lg border border-slate-600 hover:border-indigo-500 transition-all duration-300 hover:shadow-lg">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <div className="flex items-center mb-2">
                        <span className="text-xl font-bold text-white mr-3">
                            #{index + 1} {fund.name}
                        </span>
                        <span className="bg-indigo-600 text-white text-xs px-2 py-1 rounded-full">
                            {fund.symbol}
                        </span>
                    </div>
                    <div className="text-sm text-slate-400">
                        計價資產: <span className="text-emerald-400 font-medium">{fund.denominationAsset.symbol}</span>
                    </div>
                </div>
                <Button 
                    onClick={onSelect}
                    className="bg-emerald-600 hover:bg-emerald-700 text-sm px-4 py-2"
                >
                    選擇投資
                </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                    <div className="text-xs text-slate-400 mb-1">總資產價值</div>
                    <div className="text-lg font-bold text-emerald-400">
                        {gavNumber.toFixed(4)} {fund.denominationAsset.symbol}
                    </div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-slate-400 mb-1">股份價值</div>
                    <div className="text-lg font-bold text-blue-400">
                        {shareValueNumber.toFixed(6)}
                    </div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-slate-400 mb-1">總股份</div>
                    <div className="text-lg font-bold text-white">
                        {totalSupplyNumber.toFixed(4)}
                    </div>
                </div>
            </div>
            
            <div className="border-t border-slate-600 pt-3">
                <div className="flex justify-between items-center text-xs">
                    <div className="text-slate-400">
                        創建者: <span className="font-mono text-slate-300">{fund.creator.substring(0, 6)}...{fund.creator.substring(38)}</span>
                    </div>
                    <div className="text-slate-400">
                        區塊: <span className="text-slate-300">{fund.blockNumber}</span>
                    </div>
                </div>
                <div className="mt-2 text-xs text-slate-500 font-mono">
                    Vault: {fund.vaultAddress.substring(0, 10)}...{fund.vaultAddress.substring(32)}
                </div>
            </div>
        </div>
    );
};
