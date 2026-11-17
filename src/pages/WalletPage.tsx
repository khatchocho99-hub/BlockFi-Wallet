import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  Globe,
  ShieldCheck,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useMemo, useState, type FormEvent } from 'react';
import { formatTimestamp, formatUsd } from '../lib/format';
import { createWalletRequest } from '../services/firestoreService';
import type {
  UserProfile,
  WalletAddressConfig,
  WalletTransaction,
} from '../types/exchange';

interface WalletPageProps {
  profile: UserProfile;
  walletConfigs: WalletAddressConfig[];
  transactions: WalletTransaction[];
}

export function WalletPage({
  profile,
  walletConfigs,
  transactions,
}: WalletPageProps) {
  const activeConfigs = useMemo(
    () => walletConfigs.filter((c) => c.isActive),
    [walletConfigs]
  );

  const [mode, setMode] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [selectedConfigId, setSelectedConfigId] = useState<string>(
    activeConfigs[0]?.id || 'usdt_trc20'
  );
  const [amountInput, setAmountInput] = useState('500');
  const [txReference, setTxReference] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  const selectedConfig =
    activeConfigs.find((c) => c.id === selectedConfigId) || activeConfigs[0] || null;

  const totalBalance = Number(
    (profile.availableBalance + profile.tradingBalance).toFixed(2)
  );

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!selectedConfig) return;

    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFeedback({ type: 'err', text: 'Enter a valid positive simulated USD amount.' });
      return;
    }

    if (mode === 'WITHDRAWAL') {
      if (amount > profile.availableBalance) {
        setFeedback({
          type: 'err',
          text: 'Requested withdrawal exceeds your available demo balance.',
        });
        return;
      }
      if (withdrawAddress.trim().length < 8) {
        setFeedback({
          type: 'err',
          text: 'Please enter a valid sample destination wallet address.',
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      await createWalletRequest({
        uid: profile.uid,
        email: profile.email,
        type: mode,
        asset: selectedConfig.asset,
        network: selectedConfig.network,
        amount,
        address:
          mode === 'DEPOSIT' ? selectedConfig.address : withdrawAddress.trim(),
        txReference:
          mode === 'DEPOSIT'
            ? txReference.trim() || `DEMO_DEP_${Date.now().toString(36).toUpperCase()}`
            : `DEMO_WD_${Date.now().toString(36).toUpperCase()}`,
      });
      setTxReference('');
      setWithdrawAddress('');
      setFeedback({
        type: 'ok',
        text: `${mode === 'DEPOSIT' ? 'Simulated deposit' : 'Simulated withdrawal'} request submitted for admin review.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to submit wallet request',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header & Balance Summary */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 sm:p-7">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white">
              Web3 Demo Wallet
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Simulated balances and sample cryptocurrency addresses only — no real transfers executed
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-blue-300 font-mono">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Custody Simulation Mode</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-6">
          <div>
            <p className="text-xs text-slate-400">Total Balance</p>
            <p className="mt-1 text-2xl font-mono font-semibold text-white tabular-nums">
              {formatUsd(totalBalance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Available Balance</p>
            <p className="mt-1 text-2xl font-mono font-semibold text-emerald-400 tabular-nums">
              {formatUsd(profile.availableBalance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Active Futures Margin</p>
            <p className="mt-1 text-2xl font-mono font-semibold text-blue-400 tabular-nums">
              {formatUsd(profile.tradingBalance)}
            </p>
          </div>
        </div>
      </section>

      {/* Deposit / Withdrawal Split Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Interactive Transfer Form + QR */}
        <section className="lg:col-span-7 rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 space-y-6">
          <div className="flex items-center gap-2 p-1 rounded-xl bg-[#060913] border border-white/[0.08] w-fit">
            <button
              type="button"
              onClick={() => {
                setMode('DEPOSIT');
                setFeedback(null);
              }}
              className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                mode === 'DEPOSIT' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Deposit</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('WITHDRAWAL');
                setFeedback(null);
              }}
              className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                mode === 'WITHDRAWAL'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Withdraw</span>
            </button>
          </div>

          {/* Asset & Network Selector */}
          <div className="space-y-2">
            <label htmlFor="wallet-network" className="block text-xs font-medium text-slate-300">
              Select Asset &amp; Supported Network
            </label>
            <select
              id="wallet-network"
              value={selectedConfig?.id || ''}
              onChange={(e) => setSelectedConfigId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {activeConfigs.map((cfg) => (
                <option key={cfg.id} value={cfg.id}>
                  {cfg.asset} — {cfg.network}
                </option>
              ))}
            </select>
          </div>

          {mode === 'DEPOSIT' && selectedConfig && (
            <div className="rounded-xl bg-[#060913] border border-white/[0.08] p-5 flex flex-col sm:flex-row items-center gap-6">
              <div className="p-3 rounded-xl bg-white shrink-0">
                <QRCodeSVG value={selectedConfig.qrData || selectedConfig.address} size={136} />
              </div>

              <div className="flex-1 min-w-0 space-y-3 w-full">
                <div>
                  <p className="text-xs text-slate-400">
                    Sample Deposit Address ({selectedConfig.network})
                  </p>
                  <p className="mt-1 text-xs sm:text-sm font-mono text-white break-all bg-white/[0.03] border border-white/[0.06] rounded-lg p-2.5">
                    {selectedConfig.address}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <span>
                    Minimum Simulated Deposit:{' '}
                    <span className="font-mono text-slate-200">
                      {selectedConfig.minDeposit} {selectedConfig.asset}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopy(selectedConfig.address, selectedConfig.id)}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedId === selectedConfig.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Address</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="wallet-amount" className="block text-xs font-medium text-slate-300">
                Simulated USD Value
              </label>
              <input
                id="wallet-amount"
                type="number"
                min={1}
                step="0.01"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm font-mono text-white focus:outline-none focus:border-blue-500 tabular-nums"
              />
            </div>

            {mode === 'DEPOSIT' ? (
              <div className="space-y-1.5">
                <label htmlFor="wallet-txref" className="block text-xs font-medium text-slate-300">
                  Sample Transfer Reference (Optional)
                </label>
                <input
                  id="wallet-txref"
                  type="text"
                  maxLength={120}
                  value={txReference}
                  onChange={(e) => setTxReference(e.target.value)}
                  placeholder="Enter sample reference hash or leave blank"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label htmlFor="wallet-dest" className="block text-xs font-medium text-slate-300">
                  Sample Destination Address ({selectedConfig?.network})
                </label>
                <input
                  id="wallet-dest"
                  type="text"
                  required
                  minLength={8}
                  maxLength={140}
                  value={withdrawAddress}
                  onChange={(e) => setWithdrawAddress(e.target.value)}
                  placeholder="Enter sample destination wallet address"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {feedback && (
              <div
                className={`p-3 rounded-xl border text-xs ${
                  feedback.type === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                }`}
              >
                {feedback.text}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !selectedConfig}
              className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-sm font-medium text-white transition-all cursor-pointer"
            >
              {submitting
                ? 'Submitting Request...'
                : mode === 'DEPOSIT'
                ? 'Submit Simulated Deposit Request'
                : 'Submit Simulated Withdrawal Request'}
            </button>
          </form>
        </section>

        {/* Right: Supported Networks & Sample Addresses Directory */}
        <section className="lg:col-span-5 rounded-2xl border border-white/[0.08] bg-[#0B1120] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Supported Networks &amp; Addresses
              </h2>
              <p className="text-xs text-slate-400">Admin-managed sample deposit endpoints</p>
            </div>
            <Globe className="w-4 h-4 text-blue-400" />
          </div>

          <div className="divide-y divide-white/[0.06]">
            {activeConfigs.map((cfg) => (
              <div key={cfg.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <span>{cfg.asset}</span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-xs font-normal text-slate-400">{cfg.network}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopy(cfg.address, `list_${cfg.id}`)}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedId === `list_${cfg.id}` ? (
                      <span>Copied</span>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs font-mono text-slate-400 break-all">{cfg.address}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Transaction History */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#0B1120] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.08]">
          <h2 className="font-display text-base font-semibold text-white">
            Transaction History ({transactions.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] text-xs font-medium text-slate-400">
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Asset / Network</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 hidden md:table-cell">Reference</th>
                <th className="py-3 px-4 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-xs sm:text-sm">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No simulated deposits or withdrawals recorded yet.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-medium text-white">{tx.type}</td>
                    <td className="py-3 px-4 text-slate-300">
                      {tx.asset} · <span className="text-slate-400">{tx.network}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-white tabular-nums">
                      {formatUsd(tx.amount)}
                    </td>
                    <td
                      className={`py-3 px-4 font-mono text-xs font-semibold ${
                        tx.status === 'APPROVED'
                          ? 'text-emerald-400'
                          : tx.status === 'REJECTED'
                          ? 'text-rose-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {tx.status}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-400 hidden md:table-cell truncate max-w-[200px]">
                      {tx.txReference}
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-slate-400">
                      {formatTimestamp(tx.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
