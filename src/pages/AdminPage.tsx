import {
  Check,
  Clock,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  QrCode,
  Send,
  Shield,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { SecurityCardMatrix } from '../components/SecurityCardMatrix';
import {
  formatCountdown,
  formatCryptoPrice,
  formatDurationLabel,
  formatTimestamp,
  formatUsd,
} from '../lib/format';
import {
  configureAdminTradeOutcome,
  fetchAdminServerRounds,
  fetchSecurityLogs,
  ownerConfigureTotpApi,
  ownerRevokeAllSessionsApi,
  ownerRotateCard,
  ownerUpdatePassword,
  ownerUpdateSessionTtlApi,
  recordAdminSecurityAudit,
  type SecurityLogEntry,
  type ServerRoundView,
} from '../services/api';
import {
  adminAdjustUserBalance,
  adminDeleteWalletConfig,
  adminReviewKyc,
  adminReviewWalletTransaction,
  adminSaveTradeConfigAndAudit,
  adminSaveWalletConfig,
  adminUpdateTicketStatus,
  seedDefaultWalletConfigsIfEmpty,
  sendSupportMessage,
  subscribeAdminAllTrades,
  subscribeAdminAllUsers,
  subscribeAdminKycQueue,
  subscribeAdminSupportTickets,
  subscribeAdminTradeConfigs,
  subscribeAdminTransactions,
  subscribeAuditLogs,
  subscribeTicketMessages,
  subscribeWalletConfigs,
} from '../services/firestoreService';
import type {
  AdminTradeConfig,
  AuditLog,
  FuturesTrade,
  KycSubmission,
  SupportMessage,
  SupportStatus,
  SupportTicket,
  UserProfile,
  WalletAddressConfig,
  WalletTransaction,
} from '../types/exchange';

interface AdminPageProps {
  currentAdmin: UserProfile;
  isOwner: boolean;
  sessionExpiresAtMs: number | null;
  sessionTtlMinutes: number;
  totpEnabled: boolean;
  cardId: string | null;
  activeSessionsCount: number;
  onStatusRefresh: () => Promise<void>;
  onLogoutAdmin: () => Promise<void>;
}

type AdminSection =
  | 'overview'
  | 'users'
  | 'trading'
  | 'winlose'
  | 'balances'
  | 'kyc'
  | 'deposits'
  | 'withdrawals'
  | 'addresses'
  | 'qrcodes'
  | 'support'
  | 'history'
  | 'security'
  | 'settings';

export function AdminPage({
  currentAdmin,
  isOwner,
  sessionExpiresAtMs,
  sessionTtlMinutes,
  totpEnabled,
  cardId,
  activeSessionsCount,
  onStatusRefresh,
  onLogoutAdmin,
}: AdminPageProps) {
  const [section, setSection] = useState<AdminSection>('overview');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [trades, setTrades] = useState<FuturesTrade[]>([]);
  const [tradeConfigs, setTradeConfigs] = useState<Record<string, AdminTradeConfig>>({});
  const [serverRounds, setServerRounds] = useState<Record<string, ServerRoundView>>({});
  const [kycQueue, setKycQueue] = useState<KycSubmission[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [walletConfigs, setWalletConfigs] = useState<WalletAddressConfig[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [securityLogs, setSecurityLogs] = useState<SecurityLogEntry[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [statusBanner, setStatusBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Balance adjustment state
  const [selectedUserUid, setSelectedUserUid] = useState<string>('');
  const [editAvail, setEditAvail] = useState('');
  const [editTrading, setEditTrading] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  // KYC & Wallet notes
  const [kycNotes, setKycNotes] = useState<Record<string, string>>({});
  const [txNotes, setTxNotes] = useState<Record<string, string>>({});

  // Wallet Config Form
  const [cfgId, setCfgId] = useState('');
  const [cfgAsset, setCfgAsset] = useState('USDT');
  const [cfgName, setCfgName] = useState('Tether USD (Demo)');
  const [cfgNetwork, setCfgNetwork] = useState('TRON (TRC20)');
  const [cfgAddress, setCfgAddress] = useState('');
  const [cfgQrData, setCfgQrData] = useState('');
  const [cfgMinDeposit, setCfgMinDeposit] = useState('10');

  // Support Chat
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [ticketMessages, setTicketMessages] = useState<SupportMessage[]>([]);
  const [adminReply, setAdminReply] = useState('');

  // Owner Admin Settings state
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [rotatePass, setRotatePass] = useState('');
  const [rotatedCard, setRotatedCard] = useState<{
    cardId: string;
    plainGrid: Record<string, string>;
  } | null>(null);
  const [ttlInput, setTtlInput] = useState(String(sessionTtlMinutes));
  const [totpSetup, setTotpSetup] = useState<{
    secret: string;
    otpauthUri: string;
  } | null>(null);
  const [totpConfirmCode, setTotpConfirmCode] = useState('');
  const [totpRotatePass, setTotpRotatePass] = useState('');

  const reloadSecurityLogs = () => {
    fetchSecurityLogs()
      .then(setSecurityLogs)
      .catch(() => {});
  };

  useEffect(() => {
    void seedDefaultWalletConfigsIfEmpty(currentAdmin.email);
    const unsubs = [
      subscribeAdminAllUsers((list) => {
        setUsers(list);
        if (list.length > 0 && !selectedUserUid) {
          setSelectedUserUid(list[0].uid);
          setEditAvail(String(list[0].availableBalance));
          setEditTrading(String(list[0].tradingBalance));
        }
      }),
      subscribeAdminAllTrades(setTrades),
      subscribeAdminTradeConfigs(setTradeConfigs),
      subscribeAdminKycQueue(setKycQueue),
      subscribeAdminTransactions(setTransactions),
      subscribeWalletConfigs(setWalletConfigs),
      subscribeAdminSupportTickets(setTickets),
      subscribeAuditLogs(setAuditLogs),
    ];

    const refreshServerData = () => {
      fetchAdminServerRounds()
        .then((data) => {
          const map: Record<string, ServerRoundView> = {};
          for (const r of data.rounds) map[r.tradeId] = r;
          setServerRounds(map);
        })
        .catch(() => {});
      reloadSecurityLogs();
    };

    refreshServerData();
    const roundInterval = setInterval(refreshServerData, 3000);
    const clockInterval = setInterval(() => setNowMs(Date.now()), 500);

    return () => {
      unsubs.forEach((u) => u());
      clearInterval(roundInterval);
      clearInterval(clockInterval);
    };
  }, [currentAdmin.email]);

  useEffect(() => {
    if (!activeTicketId) {
      setTicketMessages([]);
      return;
    }
    const unsub = subscribeTicketMessages(activeTicketId, setTicketMessages);
    return () => unsub();
  }, [activeTicketId]);

  const activeTrades = useMemo(
    () => trades.filter((t) => t.status === 'ACTIVE'),
    [trades]
  );
  const settledTrades = useMemo(
    () => trades.filter((t) => t.status === 'SETTLED'),
    [trades]
  );
  const pendingKyc = useMemo(
    () => kycQueue.filter((k) => k.status === 'PENDING'),
    [kycQueue]
  );
  const deposits = useMemo(
    () => transactions.filter((t) => t.type === 'DEPOSIT'),
    [transactions]
  );
  const withdrawals = useMemo(
    () => transactions.filter((t) => t.type === 'WITHDRAWAL'),
    [transactions]
  );
  const pendingDeposits = deposits.filter((d) => d.status === 'PENDING');
  const pendingWithdrawals = withdrawals.filter((w) => w.status === 'PENDING');
  const openTickets = useMemo(
    () => tickets.filter((t) => t.status !== 'Resolved'),
    [tickets]
  );

  const selectedBalanceUser = users.find((u) => u.uid === selectedUserUid) || null;

  const handleSelectBalanceUser = (u: UserProfile) => {
    setSelectedUserUid(u.uid);
    setEditAvail(String(u.availableBalance));
    setEditTrading(String(u.tradingBalance));
    setAdjustReason('');
  };

  const handleSaveBalanceAdjustment = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedBalanceUser) return;
    const avail = Number(editAvail);
    const trading = Number(editTrading);
    if (!Number.isFinite(avail) || avail < 0 || !Number.isFinite(trading) || trading < 0) {
      setStatusBanner({ type: 'err', text: 'Balances must be non-negative numbers.' });
      return;
    }
    try {
      await adminAdjustUserBalance({
        adminUid: currentAdmin.uid,
        adminEmail: currentAdmin.email,
        targetUser: selectedBalanceUser,
        newAvailableBalance: avail,
        newTradingBalance: trading,
        reason: adjustReason || 'Admin balance adjustment',
      });
      await recordAdminSecurityAudit(
        'BALANCE_ADJUSTMENT',
        `Adjusted ${selectedBalanceUser.email} available=$${avail.toFixed(2)}, trading=$${trading.toFixed(2)}`
      );
      setAdjustReason('');
      reloadSecurityLogs();
      setStatusBanner({
        type: 'ok',
        text: `Updated demo balance for ${selectedBalanceUser.email}.`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to adjust balance',
      });
    }
  };

  const handleConfigureOutcome = async (
    trade: FuturesTrade,
    outcome: 'AUTO' | 'WIN' | 'LOSE',
    lock: boolean
  ) => {
    setStatusBanner(null);
    try {
      await configureAdminTradeOutcome(trade.id, outcome, lock);
      await adminSaveTradeConfigAndAudit({
        adminUid: currentAdmin.uid,
        adminEmail: currentAdmin.email,
        trade,
        outcome,
        locked: lock,
      });
      setStatusBanner({
        type: 'ok',
        text: `Trade ${trade.symbol}/USD set to ${outcome}${lock ? ' and permanently locked' : ''}.`,
      });
      const updated = await fetchAdminServerRounds();
      const map: Record<string, ServerRoundView> = {};
      for (const r of updated.rounds) map[r.tradeId] = r;
      setServerRounds(map);
      reloadSecurityLogs();
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to configure trade outcome',
      });
    }
  };

  const handleSaveWalletAddress = async (e: FormEvent) => {
    e.preventDefault();
    const id =
      cfgId.trim() ||
      `${cfgAsset.toLowerCase()}_${Date.now().toString(36)}`.replace(/[^a-zA-Z0-9_-]/g, '');
    try {
      await adminSaveWalletConfig({
        adminUid: currentAdmin.uid,
        adminEmail: currentAdmin.email,
        config: {
          id,
          asset: cfgAsset.trim().toUpperCase(),
          name: cfgName.trim(),
          network: cfgNetwork.trim(),
          address: cfgAddress.trim(),
          qrData: cfgQrData.trim() || cfgAddress.trim(),
          minDeposit: Number(cfgMinDeposit) || 0,
          isActive: true,
        },
      });
      await recordAdminSecurityAudit(
        'WALLET_ADDRESS_SAVED',
        `Saved ${cfgAsset.toUpperCase()} (${cfgNetwork}) sample address & QR config.`
      );
      setCfgId('');
      setCfgAddress('');
      setCfgQrData('');
      reloadSecurityLogs();
      setStatusBanner({
        type: 'ok',
        text: `Saved ${cfgAsset.toUpperCase()} wallet address & QR configuration.`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to save wallet config',
      });
    }
  };

  const handleSendAdminReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeTicketId || !adminReply.trim()) return;
    const body = adminReply.trim();
    setAdminReply('');
    await sendSupportMessage({
      ticketId: activeTicketId,
      senderUid: currentAdmin.uid,
      senderRole: 'admin',
      senderName: `${currentAdmin.username} (Admin)`,
      body,
      newStatus: 'In Progress',
    });
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setStatusBanner(null);
    try {
      await ownerUpdatePassword(curPass, newPass);
      setCurPass('');
      setNewPass('');
      reloadSecurityLogs();
      setStatusBanner({ type: 'ok', text: 'Administrator password hash updated.' });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Password update failed',
      });
    }
  };

  const handleRotateSecurityCard = async (e: FormEvent) => {
    e.preventDefault();
    setStatusBanner(null);
    try {
      const res = await ownerRotateCard(rotatePass);
      setRotatedCard(res);
      setRotatePass('');
      await onStatusRefresh();
      reloadSecurityLogs();
      setStatusBanner({
        type: 'ok',
        text: `New Security Card ${res.cardId} generated. Save it immediately.`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Card rotation failed',
      });
    }
  };

  const NAV_SECTIONS: { id: AdminSection; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'User Management', count: users.length },
    { id: 'trading', label: 'Trading Management', count: activeTrades.length },
    { id: 'winlose', label: 'WIN / LOSE Demo Controls', count: activeTrades.length },
    { id: 'balances', label: 'Balance Management' },
    { id: 'kyc', label: 'KYC Verification', count: pendingKyc.length },
    { id: 'deposits', label: 'Deposit Management', count: pendingDeposits.length },
    { id: 'withdrawals', label: 'Withdrawal Management', count: pendingWithdrawals.length },
    { id: 'addresses', label: 'Crypto Address Management' },
    { id: 'qrcodes', label: 'QR Code Management' },
    { id: 'support', label: 'Customer Support', count: openTickets.length },
    { id: 'history', label: 'Trading History', count: settledTrades.length },
    { id: 'security', label: 'Security Logs', count: securityLogs.length },
    { id: 'settings', label: 'Admin Settings' },
  ];

  const sessionRemMs = sessionExpiresAtMs ? Math.max(0, sessionExpiresAtMs - nowMs) : 0;
  const activeTicket = tickets.find((t) => t.id === activeTicketId) || null;

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100">
      {/* Secure Control Top Bar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#070B16]/90 backdrop-blur-xl">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Shield className="w-5 h-5 text-indigo-400 shrink-0" />
            <span className="font-display text-lg font-semibold text-white truncate">
              Veltrix Private Control Center
            </span>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-300">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Session: {formatCountdown(sessionRemMs)}</span>
            </div>
            <button
              type="button"
              onClick={() => void onLogoutAdmin()}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-medium text-rose-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Lock &amp; Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sidebar Navigation (Desktop) / Scroll Strip (Mobile) */}
        <aside className="lg:col-span-3 xl:col-span-2 lg:sticky lg:top-20 rounded-2xl border border-white/[0.08] bg-[#0B1120] p-2">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible">
            {NAV_SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`px-3 py-2 rounded-xl text-xs font-medium text-left flex items-center justify-between gap-2 whitespace-nowrap lg:whitespace-normal shrink-0 transition-colors cursor-pointer ${
                  section === item.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span>{item.label}</span>
                {typeof item.count === 'number' && (
                  <span
                    className={`font-mono text-[11px] ${
                      section === item.id ? 'text-indigo-100' : 'text-slate-500'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Admin Workspace */}
        <main className="lg:col-span-9 xl:col-span-10 space-y-6">
          {statusBanner && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                statusBanner.type === 'ok'
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
              }`}
            >
              <span>{statusBanner.text}</span>
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* 1. OVERVIEW */}
          {section === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                {[
                  { label: 'Users', val: users.length },
                  { label: 'Active Trades', val: activeTrades.length },
                  { label: 'Pending KYC', val: pendingKyc.length },
                  { label: 'Pending Deposits', val: pendingDeposits.length },
                  { label: 'Pending Withdrawals', val: pendingWithdrawals.length },
                  { label: 'Open Tickets', val: openTickets.length },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/[0.08] bg-[#0B1120] p-4"
                  >
                    <p className="text-xs text-slate-400">{stat.label}</p>
                    <p className="mt-1.5 text-2xl font-mono font-semibold text-white tabular-nums">
                      {stat.val}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-[#0B1120] overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold text-white">
                    Recent Security &amp; Audit Events
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSection('security')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer"
                  >
                    View All Security Logs
                  </button>
                </div>
                <div className="divide-y divide-white/[0.06]">
                  {securityLogs.slice(0, 8).map((log) => (
                    <div
                      key={log.id}
                      className="px-5 py-3.5 flex items-start justify-between gap-4"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span
                            className={
                              log.severity === 'CRITICAL'
                                ? 'text-rose-400'
                                : log.severity === 'WARNING'
                                ? 'text-amber-400'
                                : 'text-indigo-300'
                            }
                          >
                            {log.event}
                          </span>
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-400">{log.email}</span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-200">{log.details}</p>
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                        {formatTimestamp(log.timestampMs)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. USER MANAGEMENT */}
          {section === 'users' && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#0B1120] overflow-x-auto">
              <div className="px-5 py-4 border-b border-white/[0.08]">
                <h2 className="font-display text-base font-semibold text-white">
                  Registered User Accounts ({users.length})
                </h2>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.08] text-xs font-medium text-slate-400">
                    <th className="py-3.5 px-4">User</th>
                    <th className="py-3.5 px-4">Account ID</th>
                    <th className="py-3.5 px-4">KYC</th>
                    <th className="py-3.5 px-4 text-right">Available</th>
                    <th className="py-3.5 px-4 text-right">Trading</th>
                    <th className="py-3.5 px-4 text-right">Total P&amp;L</th>
                    <th className="py-3.5 px-4 text-right">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-xs sm:text-sm">
                  {users.map((u) => (
                    <tr key={u.uid} className="hover:bg-white/[0.02]">
                      <td className="py-3.5 px-4">
                        <p className="font-medium text-white">{u.username}</p>
                        <p className="text-xs font-mono text-slate-400">{u.email}</p>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
                        {u.accountId}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs">{u.kycStatus}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-white tabular-nums">
                        {formatUsd(u.availableBalance)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-blue-400 tabular-nums">
                        {formatUsd(u.tradingBalance)}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-mono tabular-nums ${
                          u.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatUsd(u.totalPnl)}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            handleSelectBalanceUser(u);
                            setSection('balances');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white cursor-pointer"
                        >
                          Balance
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 3 & 4. TRADING MANAGEMENT & WIN / LOSE DEMO CONTROLS */}
          {(section === 'trading' || section === 'winlose') && (
            <div className="space-y-6">
              <section className="rounded-2xl border border-white/[0.08] bg-[#0B1120] overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.08]">
                  <h2 className="font-display text-base font-semibold text-white">
                    {section === 'winlose'
                      ? 'WIN / LOSE Demo Outcome Controls'
                      : 'Active Futures Trading Management'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Configure WIN or LOSE outcomes before the round lock timestamp. Locked rounds are immutable.
                  </p>
                </div>

                {activeTrades.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-400">
                    No active demo futures positions open right now.
                  </p>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {activeTrades.map((trade) => {
                      const srv = serverRounds[trade.id];
                      const cfg = tradeConfigs[trade.id];
                      const currentOutcome =
                        srv?.configuredOutcome || cfg?.configuredOutcome || 'AUTO';
                      const isLocked =
                        Boolean(srv?.isLocked) ||
                        Boolean(cfg?.locked) ||
                        nowMs >= trade.lockAtMs;
                      const remainingMs = Math.max(0, trade.expiresAtMs - nowMs);
                      const lockRemMs = Math.max(0, trade.lockAtMs - nowMs);

                      return (
                        <div
                          key={trade.id}
                          className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                              <span>{trade.symbol}/USD</span>
                              <span className="text-slate-600">·</span>
                              <span
                                className={
                                  trade.direction === 'LONG'
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                                }
                              >
                                {trade.direction}
                              </span>
                              <span className="text-slate-600">·</span>
                              <span className="font-mono">{formatUsd(trade.amount)}</span>
                              <span className="text-slate-600">·</span>
                              <span className="font-mono text-xs text-slate-400">
                                {trade.userEmail}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400">
                              <span>Entry: {formatCryptoPrice(trade.entryPrice)}</span>
                              <span>·</span>
                              <span>Expiry: {formatCountdown(remainingMs)}</span>
                              <span>·</span>
                              <span>
                                {isLocked ? 'LOCKED' : `Lock in ${formatCountdown(lockRemMs)}`}
                              </span>
                              <span>·</span>
                              <span className="text-indigo-300">Mode: {currentOutcome}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={isLocked}
                              onClick={() => void handleConfigureOutcome(trade, 'WIN', false)}
                              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                currentOutcome === 'WIN'
                                  ? 'bg-emerald-600 border-emerald-500 text-white'
                                  : 'bg-[#060913] border-white/10 text-emerald-400 hover:border-emerald-500/40'
                              }`}
                            >
                              Set WIN
                            </button>
                            <button
                              type="button"
                              disabled={isLocked}
                              onClick={() => void handleConfigureOutcome(trade, 'LOSE', false)}
                              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                currentOutcome === 'LOSE'
                                  ? 'bg-rose-600 border-rose-500 text-white'
                                  : 'bg-[#060913] border-white/10 text-rose-400 hover:border-rose-500/40'
                              }`}
                            >
                              Set LOSE
                            </button>
                            <button
                              type="button"
                              disabled={isLocked}
                              onClick={() =>
                                void handleConfigureOutcome(trade, currentOutcome, true)
                              }
                              className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-medium text-amber-200 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>{isLocked ? 'Locked' : 'Lock Outcome'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* 5. BALANCE MANAGEMENT */}
          {section === 'balances' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <form
                onSubmit={handleSaveBalanceAdjustment}
                className="lg:col-span-5 rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 space-y-4"
              >
                <h2 className="font-display text-base font-semibold text-white">
                  Demo Balance Adjustment
                </h2>

                <div className="space-y-1.5">
                  <label className="block text-xs text-slate-300">Select User Account</label>
                  <select
                    value={selectedUserUid}
                    onChange={(e) => {
                      const found = users.find((u) => u.uid === e.target.value);
                      if (found) handleSelectBalanceUser(found);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-xs text-white cursor-pointer"
                  >
                    {users.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.email} ({u.accountId})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Available Balance ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      required
                      value={editAvail}
                      onChange={(e) => setEditAvail(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-sm font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">
                      Trading Balance ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      required
                      value={editTrading}
                      onChange={(e) => setEditTrading(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-sm font-mono text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Audit Reason</label>
                  <input
                    type="text"
                    required
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="Reason for demo balance modification"
                    className="w-full px-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-xs text-white"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white cursor-pointer"
                >
                  Apply Balance Change &amp; Record Audit
                </button>
              </form>

              <div className="lg:col-span-7 rounded-2xl border border-white/[0.08] bg-[#0B1120] overflow-x-auto">
                <div className="px-5 py-4 border-b border-white/[0.08]">
                  <h3 className="font-display text-base font-semibold text-white">
                    Account Balances Overview
                  </h3>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-xs text-slate-400">
                      <th className="py-3 px-4">Account</th>
                      <th className="py-3 px-4 text-right">Available</th>
                      <th className="py-3 px-4 text-right">Trading</th>
                      <th className="py-3 px-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-xs">
                    {users.map((u) => (
                      <tr
                        key={u.uid}
                        onClick={() => handleSelectBalanceUser(u)}
                        className="hover:bg-white/[0.02] cursor-pointer"
                      >
                        <td className="py-3 px-4 font-mono text-slate-200">{u.email}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-400 tabular-nums">
                          {formatUsd(u.availableBalance)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-blue-400 tabular-nums">
                          {formatUsd(u.tradingBalance)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-white font-semibold tabular-nums">
                          {formatUsd(u.availableBalance + u.tradingBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. KYC VERIFICATION */}
          {section === 'kyc' && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#0B1120] divide-y divide-white/[0.06]">
              {kycQueue.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-400">
                  No KYC submissions recorded.
                </p>
              ) : (
                kycQueue.map((item) => (
                  <div
                    key={item.id}
                    className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                        <span>{item.fullName}</span>
                        <span className="text-slate-600">·</span>
                        <span className="font-mono text-xs text-slate-400">{item.email}</span>
                        <span className="text-slate-600">·</span>
                        <span
                          className={`font-mono text-xs ${
                            item.status === 'APPROVED'
                              ? 'text-emerald-400'
                              : item.status === 'REJECTED'
                              ? 'text-rose-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-slate-400">
                        {item.documentType} · {item.documentNumber} · {item.country} · File:{' '}
                        {item.sampleDocName}
                      </p>
                    </div>

                    {item.status === 'PENDING' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          placeholder="Review note (optional)"
                          value={kycNotes[item.id] || ''}
                          onChange={(e) =>
                            setKycNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          className="px-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-xs text-white"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            void adminReviewKyc({
                              adminUid: currentAdmin.uid,
                              adminEmail: currentAdmin.email,
                              submission: item,
                              decision: 'APPROVED',
                              reviewNote: kycNotes[item.id] || 'Approved',
                            }).then(() =>
                              recordAdminSecurityAudit(
                                'KYC_APPROVED',
                                `Approved KYC for ${item.email}`
                              )
                            )
                          }
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void adminReviewKyc({
                              adminUid: currentAdmin.uid,
                              adminEmail: currentAdmin.email,
                              submission: item,
                              decision: 'REJECTED',
                              reviewNote: kycNotes[item.id] || 'Rejected',
                            }).then(() =>
                              recordAdminSecurityAudit(
                                'KYC_REJECTED',
                                `Rejected KYC for ${item.email}`,
                                'WARNING'
                              )
                            )
                          }
                          className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-medium text-white flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* 7 & 8. DEPOSIT MANAGEMENT / WITHDRAWAL MANAGEMENT */}
          {(section === 'deposits' || section === 'withdrawals') && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#0B1120] divide-y divide-white/[0.06]">
              <div className="px-5 py-4 border-b border-white/[0.08]">
                <h2 className="font-display text-base font-semibold text-white">
                  {section === 'deposits' ? 'Deposit Requests' : 'Withdrawal Requests'}
                </h2>
              </div>

              {(section === 'deposits' ? deposits : withdrawals).length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-400">
                  No {section} recorded yet.
                </p>
              ) : (
                (section === 'deposits' ? deposits : withdrawals).map((tx) => {
                  const targetUser = users.find((u) => u.uid === tx.uid);
                  return (
                    <div
                      key={tx.id}
                      className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                          <span className="font-mono text-emerald-400">
                            {formatUsd(tx.amount)}
                          </span>
                          <span className="text-slate-600">·</span>
                          <span className="text-xs text-slate-300">
                            {tx.asset} ({tx.network})
                          </span>
                          <span className="text-slate-600">·</span>
                          <span
                            className={`text-xs font-mono ${
                              tx.status === 'APPROVED'
                                ? 'text-emerald-400'
                                : tx.status === 'REJECTED'
                                ? 'text-rose-400'
                                : 'text-amber-400'
                            }`}
                          >
                            {tx.status}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-slate-400">
                          {tx.email} · Addr: {tx.address} · Ref: {tx.txReference}
                        </p>
                      </div>

                      {tx.status === 'PENDING' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            placeholder="Admin note"
                            value={txNotes[tx.id] || ''}
                            onChange={(e) =>
                              setTxNotes((prev) => ({ ...prev, [tx.id]: e.target.value }))
                            }
                            className="px-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-xs text-white"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void adminReviewWalletTransaction({
                                adminUid: currentAdmin.uid,
                                adminEmail: currentAdmin.email,
                                tx,
                                targetUserBalance: targetUser?.availableBalance ?? 0,
                                decision: 'APPROVED',
                                adminNote: txNotes[tx.id] || 'Approved',
                              }).then(() =>
                                recordAdminSecurityAudit(
                                  `${tx.type}_APPROVED`,
                                  `Approved ${tx.type} of $${tx.amount} for ${tx.email}`
                                )
                              )
                            }
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white cursor-pointer"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void adminReviewWalletTransaction({
                                adminUid: currentAdmin.uid,
                                adminEmail: currentAdmin.email,
                                tx,
                                targetUserBalance: targetUser?.availableBalance ?? 0,
                                decision: 'REJECTED',
                                adminNote: txNotes[tx.id] || 'Rejected',
                              }).then(() =>
                                recordAdminSecurityAudit(
                                  `${tx.type}_REJECTED`,
                                  `Rejected ${tx.type} of $${tx.amount} for ${tx.email}`,
                                  'WARNING'
                                )
                              )
                            }
                            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-medium text-white cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 9 & 10. CRYPTO ADDRESS MANAGEMENT & QR CODE MANAGEMENT */}
          {(section === 'addresses' || section === 'qrcodes') && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <form
                onSubmit={handleSaveWalletAddress}
                className="lg:col-span-5 rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 space-y-4"
              >
                <div className="flex items-center gap-2">
                  {section === 'qrcodes' ? (
                    <QrCode className="w-4 h-4 text-indigo-400" />
                  ) : (
                    <Plus className="w-4 h-4 text-indigo-400" />
                  )}
                  <h2 className="font-display text-base font-semibold text-white">
                    {section === 'qrcodes'
                      ? 'QR Code Payload Manager'
                      : 'Cryptocurrency Address Manager'}
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Asset (e.g. BTC)"
                    value={cfgAsset}
                    onChange={(e) => setCfgAsset(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-xs text-white"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Network (e.g. TRC20)"
                    value={cfgNetwork}
                    onChange={(e) => setCfgNetwork(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-xs text-white"
                  />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Display Name"
                  value={cfgName}
                  onChange={(e) => setCfgName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-xs text-white"
                />
                <input
                  type="text"
                  required
                  minLength={8}
                  placeholder="Sample Cryptocurrency Deposit Address"
                  value={cfgAddress}
                  onChange={(e) => setCfgAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-xs font-mono text-white"
                />
                <input
                  type="text"
                  placeholder="QR Code Payload URI (defaults to address)"
                  value={cfgQrData}
                  onChange={(e) => setCfgQrData(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-xs font-mono text-white"
                />
                <input
                  type="number"
                  step="0.0001"
                  min={0}
                  placeholder="Min Deposit"
                  value={cfgMinDeposit}
                  onChange={(e) => setCfgMinDeposit(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-xs font-mono text-white"
                />

                {cfgAddress.trim().length >= 8 && (
                  <div className="p-3 rounded-xl bg-[#060913] border border-white/[0.06] flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-white shrink-0">
                      <QRCodeSVG value={cfgQrData.trim() || cfgAddress.trim()} size={64} />
                    </div>
                    <p className="text-xs text-slate-400">Live QR Code Preview</p>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white cursor-pointer"
                >
                  Save Address &amp; QR Configuration
                </button>
              </form>

              <div className="lg:col-span-7 space-y-3">
                {walletConfigs.map((cfg) => (
                  <div
                    key={cfg.id}
                    className="rounded-2xl border border-white/[0.08] bg-[#0B1120] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="p-2 rounded-lg bg-white shrink-0">
                        <QRCodeSVG value={cfg.qrData || cfg.address} size={72} />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-semibold text-white">
                          {cfg.asset} · {cfg.network}
                        </p>
                        <p className="text-xs font-mono text-slate-400 break-all">
                          Addr: {cfg.address}
                        </p>
                        <p className="text-[11px] font-mono text-indigo-300 break-all">
                          QR: {cfg.qrData}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setCfgId(cfg.id);
                          setCfgAsset(cfg.asset);
                          setCfgName(cfg.name);
                          setCfgNetwork(cfg.network);
                          setCfgAddress(cfg.address);
                          setCfgQrData(cfg.qrData);
                          setCfgMinDeposit(String(cfg.minDeposit));
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white/10 text-xs text-white cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void adminDeleteWalletConfig({
                            adminUid: currentAdmin.uid,
                            adminEmail: currentAdmin.email,
                            configId: cfg.id,
                          })
                        }
                        aria-label={`Delete ${cfg.id}`}
                        className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 11. CUSTOMER SUPPORT */}
          {section === 'support' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5 rounded-2xl border border-white/[0.08] bg-[#0B1120] divide-y divide-white/[0.06]">
                {tickets.length === 0 ? (
                  <p className="p-6 text-xs text-slate-400">No support tickets yet.</p>
                ) : (
                  tickets.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTicketId(t.id)}
                      className={`w-full text-left p-4 cursor-pointer ${
                        activeTicketId === t.id ? 'bg-indigo-500/10' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-white truncate">{t.subject}</p>
                        <span className="text-xs font-mono text-indigo-300 shrink-0">
                          {t.status}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-slate-400 mt-0.5">{t.email}</p>
                      <p className="text-xs text-slate-400 truncate mt-1">
                        {t.lastMessagePreview}
                      </p>
                    </button>
                  ))
                )}
              </div>

              <div className="lg:col-span-7 rounded-2xl border border-white/[0.08] bg-[#0B1120] flex flex-col h-[500px]">
                {!activeTicket ? (
                  <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                    Select a customer ticket to reply.
                  </div>
                ) : (
                  <>
                    <div className="px-5 py-3.5 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{activeTicket.subject}</p>
                        <p className="text-xs font-mono text-slate-400">{activeTicket.email}</p>
                      </div>
                      <select
                        value={activeTicket.status}
                        onChange={(e) =>
                          void adminUpdateTicketStatus({
                            adminUid: currentAdmin.uid,
                            adminEmail: currentAdmin.email,
                            ticket: activeTicket,
                            status: e.target.value as SupportStatus,
                          })
                        }
                        className="px-3 py-1.5 rounded-lg bg-[#060913] border border-white/10 text-xs text-white cursor-pointer"
                      >
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-3">
                      {ticketMessages.map((m) => (
                        <div
                          key={m.id}
                          className={`flex flex-col max-w-[82%] ${
                            m.senderRole === 'admin'
                              ? 'ml-auto items-end'
                              : 'mr-auto items-start'
                          }`}
                        >
                          <span className="text-[11px] text-slate-400 mb-1">
                            {m.senderName}
                          </span>
                          <div
                            className={`px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm ${
                              m.senderRole === 'admin'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-[#060913] border border-white/10 text-slate-100'
                            }`}
                          >
                            {m.body}
                          </div>
                        </div>
                      ))}
                    </div>

                    <form
                      onSubmit={handleSendAdminReply}
                      className="p-4 border-t border-white/[0.08] flex items-center gap-2.5"
                    >
                      <input
                        type="text"
                        value={adminReply}
                        onChange={(e) => setAdminReply(e.target.value)}
                        placeholder="Write admin support reply..."
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="submit"
                        disabled={!adminReply.trim()}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-45 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                        <span>Reply</span>
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 12. TRADING HISTORY */}
          {section === 'history' && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#0B1120] overflow-x-auto">
              <div className="px-5 py-4 border-b border-white/[0.08]">
                <h2 className="font-display text-base font-semibold text-white">
                  Platform Trading History ({trades.length})
                </h2>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.08] text-xs font-medium text-slate-400">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Contract</th>
                    <th className="py-3 px-4">Dir</th>
                    <th className="py-3 px-4 text-right">Stake</th>
                    <th className="py-3 px-4 text-right">Entry</th>
                    <th className="py-3 px-4 text-right">Exit</th>
                    <th className="py-3 px-4 text-right">Result</th>
                    <th className="py-3 px-4 text-right">Net P&amp;L</th>
                    <th className="py-3 px-4 text-right">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-xs">
                  {trades.map((t) => (
                    <tr key={t.id}>
                      <td className="py-3 px-4 font-mono text-slate-300">{t.userEmail}</td>
                      <td className="py-3 px-4 text-white">
                        {t.symbol}/USD · {formatDurationLabel(t.durationSeconds)}
                      </td>
                      <td className="py-3 px-4 font-mono">{t.direction}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {formatUsd(t.amount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400 tabular-nums">
                        {formatCryptoPrice(t.entryPrice)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400 tabular-nums">
                        {t.exitPrice > 0 ? formatCryptoPrice(t.exitPrice) : '—'}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-semibold ${
                          t.result === 'WIN'
                            ? 'text-emerald-400'
                            : t.result === 'LOSE'
                            ? 'text-rose-400'
                            : 'text-blue-400'
                        }`}
                      >
                        {t.result}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {formatUsd(t.netPnl)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400">
                        {formatTimestamp(t.startedAtMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 13. SECURITY LOGS */}
          {section === 'security' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/[0.08] bg-[#0B1120] overflow-x-auto">
                <div className="px-5 py-4 border-b border-white/[0.08]">
                  <h2 className="font-display text-base font-semibold text-white">
                    Server Authentication &amp; Intrusion Security Logs ({securityLogs.length})
                  </h2>
                  <p className="text-xs text-slate-400">
                    Records login attempts, failed passwords/card codes, temporary lockouts, blocked routes, and credential updates
                  </p>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-xs font-medium text-slate-400">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Event</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">IP</th>
                      <th className="py-3 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-xs">
                    {securityLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                          {formatTimestamp(log.timestampMs)}
                        </td>
                        <td
                          className={`py-3 px-4 font-mono font-semibold whitespace-nowrap ${
                            log.severity === 'CRITICAL'
                              ? 'text-rose-400'
                              : log.severity === 'WARNING'
                              ? 'text-amber-400'
                              : 'text-indigo-300'
                          }`}
                        >
                          {log.event}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300">{log.email}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{log.ip}</td>
                        <td className="py-3 px-4 text-slate-200">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-[#0B1120] overflow-x-auto">
                <div className="px-5 py-4 border-b border-white/[0.08]">
                  <h2 className="font-display text-base font-semibold text-white">
                    Firestore Operational Audit Logs ({auditLogs.length})
                  </h2>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-xs font-medium text-slate-400">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Admin</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-xs">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                          {formatTimestamp(log.createdAt)}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300">{log.adminEmail}</td>
                        <td className="py-3 px-4 font-mono text-indigo-300">{log.action}</td>
                        <td className="py-3 px-4 text-slate-200">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 14. ADMIN SETTINGS (OWNER CREDENTIAL GOVERNANCE) */}
          {section === 'settings' && (
            <div className="space-y-6">
              {!isOwner ? (
                <div className="rounded-2xl border border-amber-500/30 bg-[#0B1120] p-6 flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                  <p className="text-xs sm:text-sm text-slate-300">
                    Only the authorized owner can modify administrator passwords, Security Card credentials, or session policies.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  {/* Change Admin Password */}
                  <form
                    onSubmit={handlePasswordChange}
                    className="rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 space-y-4"
                  >
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-indigo-400" />
                      <h2 className="font-display text-base font-semibold text-white">
                        Change Administrator Password
                      </h2>
                    </div>
                    <input
                      type="password"
                      required
                      placeholder="Current admin password"
                      value={curPass}
                      onChange={(e) => setCurPass(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-xs text-white"
                    />
                    <input
                      type="password"
                      required
                      minLength={10}
                      placeholder="New admin password (min 10 chars)"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-xs text-white"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white cursor-pointer"
                    >
                      Update Password Hash
                    </button>
                  </form>

                  {/* Session Timeout & Revocation */}
                  <div className="rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 space-y-4">
                    <h2 className="font-display text-base font-semibold text-white">
                      Session Security Policy
                    </h2>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Active Server Sessions: {activeSessionsCount}</span>
                      <span>Registered Card: {cardId || 'Active'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={5}
                        max={240}
                        value={ttlInput}
                        onChange={(e) => setTtlInput(e.target.value)}
                        className="w-28 px-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-xs font-mono text-white"
                      />
                      <span className="text-xs text-slate-400">minutes TTL</span>
                      <button
                        type="button"
                        onClick={() =>
                          void ownerUpdateSessionTtlApi(Number(ttlInput)).then((ttl) => {
                            setStatusBanner({
                              type: 'ok',
                              text: `Session timeout updated to ${ttl} minutes.`,
                            });
                            void onStatusRefresh();
                          })
                        }
                        className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white cursor-pointer"
                      >
                        Save TTL
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void ownerRevokeAllSessionsApi().then(() => onStatusRefresh())
                      }
                      className="px-4 py-2 rounded-xl border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-medium text-rose-200 cursor-pointer"
                    >
                      Revoke All Active Admin Sessions
                    </button>
                  </div>

                  {/* Rotate Security Card */}
                  <div className="rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 space-y-4">
                    <h2 className="font-display text-base font-semibold text-white">
                      Rotate Security Card
                    </h2>
                    <p className="text-xs text-slate-400">
                      Generates a fresh 24-cell Security Card and immediately invalidates all previous card codes.
                    </p>
                    <form onSubmit={handleRotateSecurityCard} className="flex items-center gap-2">
                      <input
                        type="password"
                        required
                        placeholder="Confirm current password"
                        value={rotatePass}
                        onChange={(e) => setRotatePass(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-xs text-white"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white cursor-pointer"
                      >
                        Rotate Card
                      </button>
                    </form>

                    {rotatedCard && (
                      <SecurityCardMatrix
                        cardId={rotatedCard.cardId}
                        plainGrid={rotatedCard.plainGrid}
                      />
                    )}
                  </div>

                  {/* Mandatory TOTP Authenticator 2FA */}
                  <div className="rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-base font-semibold text-white">
                        Mandatory Authenticator 2FA (TOTP)
                      </h2>
                      <span className="text-xs font-mono text-emerald-400">
                        {totpEnabled ? 'Mandatory · Active' : 'Enforced'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      Six-digit authenticator verification is mandatory on every admin login and cannot be disabled. You may rotate your authenticator secret key below.
                    </p>

                    {totpSetup ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-4">
                          <div className="p-2 rounded-lg bg-white shrink-0">
                            <QRCodeSVG value={totpSetup.otpauthUri} size={110} />
                          </div>
                          <div className="text-xs space-y-1">
                            <p className="text-slate-300">
                              Scan with Google Authenticator or Authy, then confirm with the new 6-digit code:
                            </p>
                            <p className="font-mono text-indigo-300 break-all">
                              {totpSetup.secret}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="6-digit code"
                            value={totpConfirmCode}
                            onChange={(e) =>
                              setTotpConfirmCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                            }
                            className="w-36 px-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-xs font-mono text-white"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void ownerConfigureTotpApi({
                                action: 'CONFIRM',
                                secret: totpSetup.secret,
                                code: totpConfirmCode,
                              })
                                .then(() => {
                                  setTotpSetup(null);
                                  setTotpConfirmCode('');
                                  setTotpRotatePass('');
                                  void onStatusRefresh();
                                  reloadSecurityLogs();
                                  setStatusBanner({
                                    type: 'ok',
                                    text: 'Mandatory TOTP Authenticator key rotated.',
                                  });
                                })
                                .catch((err) =>
                                  setStatusBanner({
                                    type: 'err',
                                    text: err instanceof Error ? err.message : 'Invalid code',
                                  })
                                )
                            }
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white cursor-pointer"
                          >
                            Confirm Rotation
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTotpSetup(null);
                              setTotpConfirmCode('');
                            }}
                            className="px-3 py-2 rounded-xl border border-white/10 text-xs text-slate-300 hover:text-white cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          placeholder="Current password to rotate key"
                          value={totpRotatePass}
                          onChange={(e) => setTotpRotatePass(e.target.value)}
                          className="flex-1 px-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-xs text-white"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            void ownerConfigureTotpApi({
                              action: 'BEGIN',
                              currentPassword: totpRotatePass,
                            })
                              .then((res) => {
                                if (res.secret && res.otpauthUri) {
                                  setTotpSetup({
                                    secret: res.secret,
                                    otpauthUri: res.otpauthUri,
                                  });
                                }
                              })
                              .catch((err) =>
                                setStatusBanner({
                                  type: 'err',
                                  text: err instanceof Error ? err.message : 'Password check failed',
                                })
                              )
                          }
                          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white cursor-pointer"
                        >
                          Rotate Authenticator Key
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
