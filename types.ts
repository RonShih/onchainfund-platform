import { ethers } from 'ethers';
import type { Eip1193Provider } from 'ethers';

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    ethers?: any;
  }
}

export type Step = {
  name: string;
};

export type VaultData = {
  name: string;
  symbol: string;
  denominationAsset: string;
  sharesLockUp: number; // in hours
  managementFeeEnabled: boolean;
  managementFeeRate: number;
  performanceFeeEnabled: boolean;
  performanceFeeRate: number;
  entranceFeeEnabled: boolean;
  entranceFeeRate: number;
  entranceFeeRecipient: string;
  exitFeeEnabled: boolean;
  depositWhitelistEnabled: boolean;
  whitelistAddresses: string[];
};

export interface EthersError extends Error {
  code?: string;
  reason?: string;
  transaction?: any;
}