# 🏦 OnChainFund Platform

一個基於區塊鏈的去中心化投資基金管理平台，建立在 Ethereum Sepolia 測試網上。

## ✨ 功能特色

- 🔐 **去中心化金庫管理** - 創建和管理您自己的投資基金
- 💰 **智能投資** - 投資現有基金並追蹤績效  
- 🔒 **安全透明** - 基於智能合約的完全透明操作
- 📊 **實時數據** - 即時查看基金表現和資產價值

## 🛠 技術棧

- **前端**: React 18 + TypeScript + Vite
- **區塊鏈**: Ethereum Sepolia Testnet
- **錢包集成**: MetaMask
- **智能合約**: Ethers.js v6
- **樣式**: Tailwind CSS

## 🚀 快速開始

### 前置需求

- Node.js 16+
- MetaMask 錢包
- Sepolia 測試網 ETH

### 安裝

1. 克隆專案
```bash
git clone https://github.com/[您的用戶名]/onchainfund-platform.git
cd onchainfund-platform
```

2. 安裝依賴
```bash
npm install
```

3. 啟動開發服務器
```bash
npm run dev
```

4. 開啟瀏覽器訪問 `http://localhost:5173`

## 🔧 配置

### MetaMask 設置

1. 添加 Sepolia 測試網：
   - 網絡名稱: Sepolia Testnet
   - RPC URL: `https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161`
   - Chain ID: 11155111
   - 貨幣符號: SEP

2. 獲取測試 ETH：
   - 訪問 [Sepolia Faucet](https://sepoliafaucet.com/)
   - 輸入您的錢包地址獲取測試 ETH

## 📖 使用指南

### 創建金庫
1. 連接 MetaMask 錢包
2. 點擊「Create Your Vault」
3. 填寫基金資訊（名稱、符號、費用設置等）
4. 部署智能合約

### 管理投資
1. 點擊「Manage Existing Vault」
2. 輸入金庫地址
3. 進行存款或贖回操作

## 🏗 項目結構

```
onchainfund-platform/
├── components/          # React 組件
│   ├── CreateVaultForm.tsx
│   ├── ManageVault.tsx
│   ├── FundList.tsx
│   └── ui.tsx
├── constants.ts         # 合約 ABI 和地址
├── types.ts            # TypeScript 類型定義
├── App.tsx             # 主應用組件
└── index.tsx           # 應用入口點
```

## 🔗 合約地址

- **Fund Factory**: `0x9D2C19a267caDA33da70d74aaBF9d2f75D3CdC14`
- **ASVT Token**: `0x932b08d5553b7431FB579cF27565c7Cd2d4b8fE0`

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📄 授權

MIT License

## ⚠️ 免責聲明

此項目僅用於教育和測試目的。請勿在主網上使用未經審計的智能合約。
