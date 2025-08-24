import React, { useState, useCallback } from 'react';
import { ethers, BrowserProvider, Log } from 'ethers';
import { Input, Button, ToggleSwitch, Select } from './ui';
import Stepper from './Stepper';
import { CREATION_STEPS, FUND_FACTORY_ADDRESS, FUND_FACTORY_ABI, DENOMINATION_ASSETS, DEFAULT_DENOMINATION_ASSET, ENTRACE_RATE_DIRECT_FEE_ADDRESS, ADDRESS_LIST_REGISTRY, ADDRESS_LIST_REGISTRY_ABI, ALLOWED_DEPOSIT_RECIPIENTS_POLICY_ADDRESS } from '../constants';
import type { VaultData, EthersError } from '../types';

interface CreateVaultFormProps {
    provider: BrowserProvider;
    signer: ethers.Signer;
    account: string;
    onBack: () => void;
}

export default function CreateVaultForm({ signer, account, onBack }: CreateVaultFormProps) {
    const [currentStep, setCurrentStep] = useState(1);
    const [formData, setFormData] = useState<VaultData>({
        name: '',
        symbol: '',
        denominationAsset: DEFAULT_DENOMINATION_ASSET, // 使用 ASVT 作為默認
        sharesLockUp: 0,
        managementFeeEnabled: true,
        managementFeeRate: 1,
        performanceFeeEnabled: true,
        performanceFeeRate: 10,
        entranceFeeEnabled: false,
        entranceFeeRate: 1,
        entranceFeeRecipient: account,
        exitFeeEnabled: false,
        depositWhitelistEnabled: false,
        whitelistAddresses: [ethers.getAddress(account)], // 使用 checksum 格式
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successInfo, setSuccessInfo] = useState<{ vault: string; comptroller: string } | null>(null);
    const [newAddressInput, setNewAddressInput] = useState('');

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };
    
    const handleSelectChange = (name: keyof VaultData, value: string) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleToggleChange = (name: keyof VaultData, enabled: boolean) => {
        setFormData(prev => ({ ...prev, [name]: enabled }));
    };

    // 管理白名單地址
    const addWhitelistAddress = (address: string) => {
        console.log('嘗試添加地址:', address);
        
        if (!address || address.trim() === '') {
            console.log('地址為空，跳過');
            return;
        }
        
        if (!ethers.isAddress(address)) {
            console.log('無效地址:', address);
            alert('無效地址，請輸入正確的以太坊地址');
            return;
        }
        
        // 統一轉為 checksum 格式
        const checksumAddress = ethers.getAddress(address);
        console.log('Checksum 地址:', checksumAddress);
        
        // 檢查是否已存在（使用 checksum 比較）
        const exists = formData.whitelistAddresses.some(addr => {
            try {
                return ethers.getAddress(addr) === checksumAddress;
            } catch {
                return addr === address; // 備用比較
            }
        });
        
        if (exists) {
            console.log('地址已存在於白名單中:', checksumAddress);
            alert('此地址已存在於白名單中');
            return;
        }
        
        console.log('添加地址到白名單:', checksumAddress);
        console.log('當前白名單:', formData.whitelistAddresses);
        
        setFormData(prev => {
            const newWhitelist = [...prev.whitelistAddresses, checksumAddress];
            console.log('新的白名單:', newWhitelist);
            return {
                ...prev,
                whitelistAddresses: newWhitelist
            };
        });
    };

    const removeWhitelistAddress = (address: string) => {
        setFormData(prev => ({
            ...prev,
            whitelistAddresses: prev.whitelistAddresses.filter(addr => addr !== address)
        }));
    };

    // 構建 FeeManager 配置數據
    const buildFeeManagerConfigData = useCallback(() => {
        if (!formData.entranceFeeEnabled) {
            return '0x';
        }

        try {
            // EntranceRateDirectFee 設定: abi.encode(uint256 rate, address recipient)
            const rate = Math.floor(formData.entranceFeeRate * 100); // 1% = 100 (基於 10000)
            const recipient = formData.entranceFeeRecipient || account;
            
            const entranceFeeSettings = ethers.AbiCoder.defaultAbiCoder().encode(
                ['uint256', 'address'],
                [rate, recipient]
            );

            // FeeManager 配置: abi.encode(address[] feeAddresses, bytes[] feeSettings)
            const feeManagerConfigData = ethers.AbiCoder.defaultAbiCoder().encode(
                ['address[]', 'bytes[]'],
                [[ENTRACE_RATE_DIRECT_FEE_ADDRESS], [entranceFeeSettings]]
            );

            return feeManagerConfigData;
        } catch (error) {
            console.error('構建費用配置時出錯:', error);
            return '0x';
        }
    }, [formData.entranceFeeEnabled, formData.entranceFeeRate, formData.entranceFeeRecipient, account]);

    // 構建 PolicyManager 配置數據
    const buildPolicyManagerConfigData = useCallback(async () => {
        if (!formData.depositWhitelistEnabled || formData.whitelistAddresses.length === 0) {
            return '0x';
        }

        try {
            // 1. 先創建地址列表
            const addressListRegistry = new ethers.Contract(ADDRESS_LIST_REGISTRY, ADDRESS_LIST_REGISTRY_ABI, signer);
            
            console.log('創建白名單列表...', formData.whitelistAddresses);
            
            // 方法1: 先用 staticCall 獲取會返回的 listId
            const listId = await addressListRegistry.createList.staticCall(
                account,  // owner
                0,        // UpdateType.None
                formData.whitelistAddresses
            );
            
            console.log('預期獲得的 listId:', listId.toString());
            
            // 方法2: 實際執行交易
            const createListTx = await addressListRegistry.createList(
                account,  // owner
                0,        // UpdateType.None
                formData.whitelistAddresses
            );
            
            const receipt = await createListTx.wait();
            console.log('列表創建交易確認:', receipt);
            console.log('實際使用的 listId:', listId.toString());
            
            // 2. 構建 AllowedDepositRecipientsPolicy 設定
            const policySettingsData = ethers.AbiCoder.defaultAbiCoder().encode(
                ['uint256[]', 'bytes[]'],
                [[listId], []]  // existingListIds, newListsData
            );
            
            console.log('策略設定數據:', policySettingsData);
            
            // 3. 構建 PolicyManager 配置
            const policyManagerConfigData = ethers.AbiCoder.defaultAbiCoder().encode(
                ['address[]', 'bytes[]'],
                [[ALLOWED_DEPOSIT_RECIPIENTS_POLICY_ADDRESS], [policySettingsData]]
            );
            
            console.log('最終 PolicyManager 配置:', policyManagerConfigData);
            
            return policyManagerConfigData;
        } catch (error) {
            console.error('構建策略配置時出錯:', error);
            return '0x';
        }
    }, [formData.depositWhitelistEnabled, formData.whitelistAddresses, signer, account]);

    const handleCreateVault = useCallback(async () => {
        console.log('開始創建金庫...');
        console.log('表單數據:', formData);
        console.log('計價資產地址:', formData.denominationAsset);
        
        setError(null);
        setIsLoading(true);
        
        try {
            const factory = new ethers.Contract(FUND_FACTORY_ADDRESS, FUND_FACTORY_ABI, signer);
            
            // 驗證必填字段
            if (!formData.name.trim() || !formData.symbol.trim()) {
                throw new Error('請填寫基金名稱和代號');
            }
            
            // 驗證計價資產地址
            if (!ethers.isAddress(formData.denominationAsset)) {
                throw new Error('無效的計價資產地址');
            }

            // 構建費用配置數據
            const feeManagerConfigData = buildFeeManagerConfigData();
            const policyManagerConfigData = await buildPolicyManagerConfigData();
            
            console.log('費用配置數據:', feeManagerConfigData);
            console.log('策略配置數據:', policyManagerConfigData);
            
            console.log('創建合約調用...');
            console.log('Factory 地址:', FUND_FACTORY_ADDRESS);
            console.log('參數:', {
                fundOwner: account,
                fundName: formData.name,
                fundSymbol: formData.symbol,
                denominationAsset: formData.denominationAsset,
                sharesActionTimelock: formData.sharesLockUp * 3600,
                feeManagerConfigData,
                policyManagerConfigData
            });
            
            // 預估 Gas
            const gasEstimate = await factory.createNewFund.estimateGas(
                account,
                formData.name,
                formData.symbol,
                formData.denominationAsset,
                formData.sharesLockUp * 3600,
                feeManagerConfigData,
                policyManagerConfigData
            );
            
            console.log('Gas 預估:', gasEstimate.toString());

            const tx = await factory.createNewFund(
                account,
                formData.name,
                formData.symbol,
                formData.denominationAsset,
                formData.sharesLockUp * 3600,
                feeManagerConfigData,
                policyManagerConfigData,
                {
                    gasLimit: gasEstimate * 120n / 100n // 增加 20% 緩衝
                }
            );

            console.log('交易發送:', tx.hash);
            const receipt = await tx.wait();
            console.log('交易確認:', receipt);
            console.log('交易 logs:', receipt.logs);
            
            // 使用正確的事件名稱和結構解析事件
            const newFundEvent = receipt.logs
                .map((log: Log) => {
                    try {
                        const parsedLog = factory.interface.parseLog(log);
                        console.log('解析的事件:', parsedLog);
                        return parsedLog;
                    } catch (e) {
                        return null; // 忽略不匹配的日誌
                    }
                })
                .find((event: any) => event?.name === 'NewFundCreated');

            console.log('找到的 NewFundCreated 事件:', newFundEvent);

            if (newFundEvent && newFundEvent.args) {
                console.log('基金創建成功!', {
                    creator: newFundEvent.args.creator,
                    vaultProxy: newFundEvent.args.vaultProxy,
                    comptrollerProxy: newFundEvent.args.comptrollerProxy
                });
                
                setSuccessInfo({
                    vault: newFundEvent.args.vaultProxy,
                    comptroller: newFundEvent.args.comptrollerProxy,
                });
            } else {
                console.log("未找到 NewFundCreated 事件，但交易成功。檢查所有事件:", receipt.logs);
                
                // 嘗試手動從交易收據中獲取地址
                // 通常新創建的合約地址會在 logs 中
                let foundAddresses = [];
                for (const log of receipt.logs) {
                    if (log.topics && log.topics.length > 0) {
                        console.log('Log topics:', log.topics);
                        console.log('Log data:', log.data);
                    }
                }
                
                setError("基金已創建，但無法自動檢索地址。請在區塊瀏覽器上查看交易詳情。");
            }
           
        } catch (err) {
            const e = err as EthersError;
            console.error("金庫創建失敗:", e);
            
            let errorMessage = "創建金庫時發生未知錯誤。";
            
            if (e.reason) {
                errorMessage = e.reason;
            } else if (e.message?.includes('Bad denomination asset')) {
                const selectedAsset = DENOMINATION_ASSETS.find(asset => asset.address === formData.denominationAsset);
                errorMessage = `無效的計價資產：${selectedAsset?.name || 'Unknown'}。請確認該代幣在 Sepolia 測試網上可用。`;
            } else if (e.message?.includes('insufficient funds')) {
                errorMessage = "餘額不足。請確保您有足夠的 ETH 支付 gas 費用。";
            } else if (e.message?.includes('user rejected')) {
                errorMessage = "用戶取消了交易。";
            } else if (e.message) {
                errorMessage = e.message;
            }
            
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [formData, signer, account, buildFeeManagerConfigData, buildPolicyManagerConfigData]);

    const renderStepContent = () => {
        if (successInfo) {
            return (
                 <div className="text-center p-8 bg-slate-850 rounded-lg">
                    <h2 className="text-2xl font-bold text-green-400 mb-4">金庫創建成功！ 🎉</h2>
                    <div className="space-y-4 text-left font-mono bg-slate-900 p-4 rounded-md">
                        <div>
                            <p className="text-sm text-slate-400">Vault Proxy (金庫地址):</p>
                            <p className="text-indigo-400 break-all text-sm">{successInfo.vault}</p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Comptroller (控制器地址):</p>
                            <p className="text-indigo-400 break-all text-sm">{successInfo.comptroller}</p>
                        </div>
                    </div>
                    <p className="mt-4 text-slate-400">請保存這些地址。您需要它們來管理您的金庫。</p>
                    <div className="mt-6 space-y-2">
                        <a 
                            href={`https://sepolia.etherscan.io/address/${successInfo.vault}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-blue-400 hover:text-blue-300 underline"
                        >
                            在 Sepolia Etherscan 上查看 Vault 詳情
                        </a>
                        <a 
                            href={`https://sepolia.etherscan.io/address/${successInfo.comptroller}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-blue-400 hover:text-blue-300 underline"
                        >
                            在 Sepolia Etherscan 上查看 Comptroller 詳情
                        </a>
                    </div>
                </div>
            )
        }
        
        // Simplified content based on screenshots. Some steps are placeholders.
        switch (currentStep) {
            case 2: // Basics
                return (
                    <div className="space-y-6">
                        <Input label="Name" name="name" value={formData.name} onChange={handleInputChange} description="The name of your vault." />
                        <Input label="Symbol" name="symbol" value={formData.symbol} onChange={handleInputChange} description="The symbol is the token ticker associated with the tokenized shares of your vault." />
                        <div>
                            <Select
                                label="Denomination Asset"
                                value={formData.denominationAsset}
                                onChange={(value) => handleSelectChange('denominationAsset', value)}
                                options={DENOMINATION_ASSETS.map(asset => ({
                                    value: asset.address,
                                    label: asset.symbol,
                                    icon: asset.icon,
                                    subtitle: asset.name
                                }))}
                                description="The denomination asset is the asset in which depositors deposit into your vault and in which the vault's share price and the performance are measured."
                            />
                            <div className="mt-2 p-2 bg-slate-900 border border-slate-700 rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <span className="text-orange-400 text-xs font-medium px-2 py-1 bg-orange-900/30 border border-orange-700 rounded-full">
                                            Semi-permanent Setting
                                        </span>
                                    </div>
                                    <span className="text-green-400 text-xs font-mono">Sepolia Testnet</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-2">
                                    Selected: {DENOMINATION_ASSETS.find(asset => asset.address === formData.denominationAsset)?.name || 'Unknown Asset'}
                                </p>
                            </div>
                        </div>
                    </div>
                );
            case 4: // Deposits
                return (
                    <div className="space-y-8">
                        <div>
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-white">Limit Wallets Permitted To Deposit</h3>
                                <ToggleSwitch 
                                    enabled={formData.depositWhitelistEnabled} 
                                    onChange={(val) => handleToggleChange('depositWhitelistEnabled', val)} 
                                />
                            </div>
                            {formData.depositWhitelistEnabled && (
                                <div className="mt-4 space-y-4">
                                    <div className="p-3 bg-slate-900 border border-slate-700 rounded-lg">
                                        <p className="text-sm text-slate-400 mb-2">
                                            This policy acts in concert with but not as a replacement for the policy restricting wallets permitted to receive a share transfer. 
                                            For example, if you enable this policy but allow your vault shares to be freely transferrable, 
                                            you will limit access to new shares but not to existing ones.
                                        </p>
                                        <span className="inline-block text-green-400 text-xs font-medium px-2 py-1 bg-green-900/30 border border-green-700 rounded-full mt-2">
                                            Editable Setting
                                        </span>
                                    </div>
                                    <div className="border border-blue-500 rounded-lg p-4">
                                        <h4 className="text-white font-medium mb-3">Limit Wallets Permitted To Deposit</h4>
                                        
                                        {/* 現有地址列表 */}
                                        {formData.whitelistAddresses.length > 0 && (
                                            <div className="mb-4">
                                                <div className="space-y-2">
                                                    {formData.whitelistAddresses.map((address, index) => (
                                                        <div key={index} className="flex items-center justify-between bg-slate-800 p-2 rounded">
                                                            <span className="text-sm text-slate-300 font-mono">{address}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeWhitelistAddress(address)}
                                                                className="text-red-400 hover:text-red-300 text-xs"
                                                                disabled={ethers.getAddress(address) === ethers.getAddress(account)}
                                                            >
                                                                {ethers.getAddress(address) === ethers.getAddress(account) ? 'Owner' : '×'}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* 添加新地址 */}
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Enter address ..."
                                                value={newAddressInput}
                                                onChange={(e) => {
                                                    console.log('輸入框值變更:', e.target.value);
                                                    setNewAddressInput(e.target.value);
                                                }}
                                                className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        console.log('按下 Enter，添加地址:', newAddressInput.trim());
                                                        addWhitelistAddress(newAddressInput.trim());
                                                        setNewAddressInput('');
                                                    }
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    console.log('按下 Add 按鈕，添加地址:', newAddressInput.trim());
                                                    addWhitelistAddress(newAddressInput.trim());
                                                    setNewAddressInput('');
                                                }}
                                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                                            >
                                                Add
                                            </button>
                                        </div>
                                        
                                        <div className="flex justify-between items-center mt-3">
                                            <span className="text-xs text-slate-400">Add Owner Wallet</span>
                                            <span className="text-xs text-red-400">Required</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            case 3: // Fees
                return (
                    <div className="space-y-8">
                         <div>
                            <div className="flex justify-between items-center">
                               <h3 className="text-lg font-semibold text-white">Charge Management Fee</h3>
                               <ToggleSwitch enabled={formData.managementFeeEnabled} onChange={(val) => handleToggleChange('managementFeeEnabled', val)} />
                            </div>
                            {formData.managementFeeEnabled && <Input label="Management Fee Rate (%)" name="managementFeeRate" type="number" value={formData.managementFeeRate} onChange={handleInputChange} description="Annual percentage of total assets." className="mt-4" />}
                        </div>
                         <div>
                            <div className="flex justify-between items-center">
                               <h3 className="text-lg font-semibold text-white">Charge Performance Fee</h3>
                               <ToggleSwitch enabled={formData.performanceFeeEnabled} onChange={(val) => handleToggleChange('performanceFeeEnabled', val)} />
                            </div>
                            {formData.performanceFeeEnabled && <Input label="Performance Fee Rate (%)" name="performanceFeeRate" type="number" value={formData.performanceFeeRate} onChange={handleInputChange} description="Percentage of profits, subject to a high-water mark." className="mt-4" />}
                        </div>
                         <div>
                            <div className="flex justify-between items-center">
                               <h3 className="text-lg font-semibold text-white">Charge Entrance Fee</h3>
                               <ToggleSwitch enabled={formData.entranceFeeEnabled} onChange={(val) => handleToggleChange('entranceFeeEnabled', val)} />
                            </div>
                            {formData.entranceFeeEnabled && (
                                <div className="mt-4 space-y-4">
                                    <div className="p-3 bg-slate-900 border border-slate-700 rounded-lg">
                                        <p className="text-sm text-slate-400 mb-2">If enabled, entrance fees are charged with every new deposit.</p>
                                        <p className="text-sm text-slate-400">
                                            The fee recipient is the vault manager by default, or any other wallet. 
                                            If you wish to split fee amounts among several wallets, please contact our sales team at support@enzyme.finance.
                                        </p>
                                        <span className="inline-block text-orange-400 text-xs font-medium px-2 py-1 bg-orange-900/30 border border-orange-700 rounded-full mt-2">
                                            Semi-permanent Setting
                                        </span>
                                    </div>
                                    <Input 
                                        label="Entrance Fee Rate (%)" 
                                        name="entranceFeeRate" 
                                        type="number" 
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        value={formData.entranceFeeRate} 
                                        onChange={handleInputChange} 
                                        description="Fee percentage charged on each deposit (e.g., 1 for 1%)" 
                                    />
                                    <Input 
                                        label="Recipient Address (optional)" 
                                        name="entranceFeeRecipient" 
                                        value={formData.entranceFeeRecipient} 
                                        onChange={handleInputChange} 
                                        placeholder="Enter address ..."
                                        description="By default, the fee recipient is the vault owner"
                                    />
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="flex justify-between items-center">
                               <h3 className="text-lg font-semibold text-white">Charge Exit Fee</h3>
                               <ToggleSwitch enabled={formData.exitFeeEnabled} onChange={(val) => handleToggleChange('exitFeeEnabled', val)} />
                            </div>
                        </div>
                    </div>
                );
            case 6: // Redemptions
                 return (
                     <div className="space-y-6">
                        <div className="p-4 rounded-lg bg-yellow-900/50 border border-yellow-700">
                             <p className="text-sm text-yellow-300">Settings in this section are restrictive. Enable them to control how your depositors can redeem their shares.</p>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">Shares Lock-Up Period</h3>
                             <p className="mt-1 text-sm text-slate-400">Defines the amount of time that must pass after a user's last receipt of shares via deposit before that user is allowed to either redeem or transfer any shares.</p>
                            <Input label="Lock-up Period (hours)" name="sharesLockUp" type="number" value={formData.sharesLockUp} onChange={handleInputChange} className="mt-4" />
                        </div>
                    </div>
                 );
            default:
                return (
                    <div className="p-6 bg-slate-850 rounded-lg">
                        <h2 className="text-xl font-bold text-white mb-2">Step {currentStep}: {CREATION_STEPS[currentStep - 1].name}</h2>
                        <p className="text-slate-400">This section is a placeholder. Click Next to continue.</p>
                    </div>
                );
        }
    };

    return (
        <div className="flex flex-col md:flex-row gap-12">
            <aside className="md:w-1/4">
                <Stepper steps={CREATION_STEPS} currentStep={currentStep} />
            </aside>
            <div className="flex-1">
                <div className="bg-slate-850 p-8 rounded-xl border border-slate-700">
                    <button onClick={onBack} className="text-sm text-slate-400 hover:text-white mb-6">&larr; Back to Home</button>
                    <h2 className="text-3xl font-bold text-white mb-2">{CREATION_STEPS[currentStep-1].name}</h2>
                    <div className="border-b border-slate-700 mb-8"></div>
                    
                    {renderStepContent()}

                    {error && <div className="mt-6 p-3 bg-red-900/50 text-red-300 border border-red-700 rounded-lg">{error}</div>}

                    {!successInfo && (
                         <div className="mt-8 pt-6 border-t border-slate-700 flex justify-between items-center">
                            <Button variant="secondary" onClick={() => setCurrentStep(p => Math.max(1, p - 1))} disabled={currentStep === 1}>
                                &larr; Back
                            </Button>
                            {currentStep === CREATION_STEPS.length ? (
                                <Button onClick={handleCreateVault} disabled={isLoading}>
                                    {isLoading ? 'Creating...' : 'Create Vault'}
                                </Button>
                            ) : (
                                <Button onClick={() => setCurrentStep(p => Math.min(CREATION_STEPS.length, p + 1))}>
                                    Next &rarr;
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}