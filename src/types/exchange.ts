export type UserRole = 'customer' | 'admin';

export type KycStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type DocumentType = 'NATIONAL_ID' | 'DRIVERS_LICENSE' | 'PASSPORT';

export type TradeDirection = 'LONG' | 'SHORT';

export type TradeStatus = 'ACTIVE' | 'SETTLED';

export type TradeResult = 'PENDING' | 'WIN' | 'LOSE';

export type SupportStatus = 'Open' | 'In Progress' | 'Resolved';

export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'ADMIN_ADJUSTMENT';

export type TransactionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type NavTab = 'home' | 'markets' | 'futures' | 'wallet' | 'profile';

export interface UserSettings {
  currency: string;
  compactMode: boolean;
  confirmTrades: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  photoURL: string;
  accountId: string;
  role: UserRole;
  kycStatus: KycStatus;
  availableBalance: number;
  tradingBalance: number;
  totalPnl: number;
  favoriteCoins: string[];
  settings: UserSettings;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  high_24h: number;
  low_24h: number;
  sparkline_in_7d?: {
    price: number[];
  };
}

export interface FuturesTrade {
  id: string;
  uid: string;
  userEmail: string;
  coinId: string;
  symbol: string;
  coinName: string;
  direction: TradeDirection;
  amount: number;
  profitRate: number;
  entryPrice: number;
  exitPrice: number;
  durationSeconds: number;
  startedAtMs: number;
  lockAtMs: number;
  expiresAtMs: number;
  status: TradeStatus;
  result: TradeResult;
  payout: number;
  netPnl: number;
  settlementSignature: string;
  createdAt?: unknown;
  settledAt?: unknown;
}

export interface AdminTradeConfig {
  tradeId: string;
  configuredOutcome: 'AUTO' | 'WIN' | 'LOSE';
  locked: boolean;
  configuredBy: string;
  updatedAt?: unknown;
}

export interface KycSubmission {
  id: string;
  uid: string;
  email: string;
  fullName: string;
  documentType: DocumentType;
  documentNumber: string;
  country: string;
  sampleDocName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string;
  reviewedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WalletTransaction {
  id: string;
  uid: string;
  email: string;
  type: TransactionType;
  asset: string;
  network: string;
  amount: number;
  address: string;
  txReference: string;
  status: TransactionStatus;
  adminNote: string;
  reviewedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WalletAddressConfig {
  id: string;
  asset: string;
  name: string;
  network: string;
  address: string;
  qrData: string;
  minDeposit: number;
  isActive: boolean;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface SupportTicket {
  id: string;
  uid: string;
  email: string;
  username: string;
  subject: string;
  category: string;
  status: SupportStatus;
  lastMessagePreview: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  senderUid: string;
  senderRole: 'customer' | 'admin';
  senderName: string;
  body: string;
  createdAt?: unknown;
}

export interface AuditLog {
  id: string;
  adminUid: string;
  adminEmail: string;
  action: string;
  targetUid: string;
  targetId: string;
  details: string;
  createdAt?: unknown;
}

export interface DurationOption {
  seconds: number;
  label: string;
  shortLabel: string;
}

export const FUTURES_DURATIONS: DurationOption[] = [
  { seconds: 30, label: '30 Seconds', shortLabel: '30s' },
  { seconds: 60, label: '1 Minute', shortLabel: '1m' },
  { seconds: 180, label: '3 Minutes', shortLabel: '3m' },
  { seconds: 300, label: '5 Minutes', shortLabel: '5m' },
  { seconds: 900, label: '15 Minutes', shortLabel: '15m' },
  { seconds: 3600, label: '1 Hour', shortLabel: '1h' },
  { seconds: 21600, label: '6 Hours', shortLabel: '6h' },
  { seconds: 43200, label: '12 Hours', shortLabel: '12h' },
  { seconds: 86400, label: '24 Hours', shortLabel: '24h' },
];

export const DEFAULT_WALLET_CONFIGS: Omit<WalletAddressConfig, 'updatedAt' | 'updatedBy'>[] = [
  {
    id: 'usdt_trc20',
    asset: 'USDT',
    name: 'Tether USD (Demo)',
    network: 'TRON (TRC20)',
    address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
    qrData: 'tron:T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb?asset=USDT-TRC20',
    minDeposit: 10,
    isActive: true,
  },
  {
    id: 'usdt_erc20',
    asset: 'USDT',
    name: 'Tether USD (Demo)',
    network: 'Ethereum (ERC20)',
    address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    qrData: 'ethereum:0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    minDeposit: 25,
    isActive: true,
  },
  {
    id: 'btc_mainnet',
    asset: 'BTC',
    name: 'Bitcoin (Demo)',
    network: 'Bitcoin Network',
    address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    qrData: 'bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    minDeposit: 0.001,
    isActive: true,
  },
  {
    id: 'eth_mainnet',
    asset: 'ETH',
    name: 'Ethereum (Demo)',
    network: 'Ethereum (ERC20)',
    address: '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
    qrData: 'ethereum:0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
    minDeposit: 0.01,
    isActive: true,
  },
  {
    id: 'sol_mainnet',
    asset: 'SOL',
    name: 'Solana (Demo)',
    network: 'Solana SPL',
    address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    qrData: 'solana:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    minDeposit: 0.25,
    isActive: true,
  },
];

export const BOOTSTRAP_ADMIN_EMAIL = 'khatchocho99@gmail.com';
export const DEMO_PROFIT_RATE = 0.3;
