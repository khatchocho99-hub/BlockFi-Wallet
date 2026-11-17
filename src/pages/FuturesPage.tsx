import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CoinLogo } from '../components/CoinLogo';
import { FuturesTradeHistory } from '../components/FuturesTradeHistory';
import { LightweightCandleChart } from '../components/LightweightCandleChart';
import {
  formatCountdown,
  formatCryptoPrice,
  formatDurationLabel,
  formatPct,
  formatUsd,
} from '../lib/format';
import {
  fetchServerTimeMs,
  placeServerFuturesOrder,
  settleServerFuturesOrder,
} from '../services/api';
import {
  recordPlacedTradeInFirestore,
  settleTradeInFirestore,
} from '../services/firestoreService';
import {
  DEMO_PROFIT_RATE,
  FUTURES_DURATIONS,
  type FuturesTrade,
  type MarketCoin,
  type NavTab,
  type UserProfile,
} from '../types/exchange';

interface FuturesPageProps {
  profile: UserProfile;
  markets: MarketCoin[];
  selectedCoinId: string;
  onSelectCoinId: (coinId: string) => void;
  trades: FuturesTrade[];
  onNavigate: (tab: NavTab) => void;
}

export function FuturesPage({
  profile,
  markets,
  selectedCoinId,
  onSelectCoinId,
  trades,
  onNavigate,
}: FuturesPageProps) {
  const [durationSeconds, setDurationSeconds] = useState<number>(60);
  const [amountInput, setAmountInput] = useState<string>('100');
  const [submitting, setSubmitting] = useState<'LONG' | 'SHORT' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bannerResult, setBannerResult] = useState<{
    tradeId: string;
    symbol: string;
    result: 'WIN' | 'LOSE';
    netPnl: number;
    payout: number;
  } | null>(null);

  // Server time offset so countdown timers track authoritative server clock
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const settlingRef = useRef<Set<string>>(new Set());
  const orderTicketRef = useRef<HTMLInputElement | null>(null);

  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    let mounted = true;
    fetchServerTimeMs().then((serverMs) => {
      if (mounted) {
        setServerOffsetMs(serverMs - Date.now());
      }
    });
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const currentServerMs = nowMs + serverOffsetMs;

  const selectedCoin = useMemo(
    () => markets.find((c) => c.id === selectedCoinId) || markets[0] || null,
    [markets, selectedCoinId]
  );

  const activeTrades = useMemo(
    () => trades.filter((t) => t.status === 'ACTIVE'),
    [trades]
  );
  const settledTrades = useMemo(
    () => trades.filter((t) => t.status === 'SETTLED'),
    [trades]
  );

  // Automatic settlement when countdown reaches zero
  useEffect(() => {
    for (const trade of activeTrades) {
      if (currentServerMs >= trade.expiresAtMs && !settlingRef.current.has(trade.id)) {
        settlingRef.current.add(trade.id);
        void (async () => {
          try {
            const settlement = await settleServerFuturesOrder(trade.id);
            const latestProfile = profileRef.current;
            await settleTradeInFirestore({
              trade,
              result: settlement.result,
              exitPrice: settlement.exitPrice,
              payout: settlement.payout,
              netPnl: settlement.netPnl,
              settlementSignature: settlement.settlementSignature,
              currentAvailableBalance: latestProfile.availableBalance,
              currentTradingBalance: latestProfile.tradingBalance,
              currentTotalPnl: latestProfile.totalPnl,
            });
            setBannerResult({
              tradeId: trade.id,
              symbol: trade.symbol,
              result: settlement.result,
              netPnl: settlement.netPnl,
              payout: settlement.payout,
            });
          } catch (err) {
            settlingRef.current.delete(trade.id);
            console.error('Auto-settlement check:', err);
          }
        })();
      }
    }
  }, [activeTrades, currentServerMs]);

  const numericAmount = Number(amountInput) || 0;
  const estProfit = Number((numericAmount * DEMO_PROFIT_RATE).toFixed(2));
  const estTotalReturn = Number((numericAmount + estProfit).toFixed(2));
  const kycApproved = profile.kycStatus === 'APPROVED';

  const handlePlaceTrade = async (direction: 'LONG' | 'SHORT') => {
    setErrorMsg(null);
    setBannerResult(null);

    if (!kycApproved) {
      setErrorMsg('KYC approval is required before placing demo futures contracts.');
      return;
    }
    if (!selectedCoin) {
      setErrorMsg('Market data is still loading.');
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount < 1) {
      setErrorMsg('Minimum simulated stake is $1.00.');
      return;
    }
    if (numericAmount > profile.availableBalance) {
      setErrorMsg('Insufficient available demo balance.');
      return;
    }

    setSubmitting(direction);
    try {
      const serverOrder = await placeServerFuturesOrder({
        coinId: selectedCoin.id,
        symbol: selectedCoin.symbol,
        coinName: selectedCoin.name,
        direction,
        amount: Number(numericAmount.toFixed(2)),
        durationSeconds,
      });

      await recordPlacedTradeInFirestore({
        tradeId: serverOrder.tradeId,
        uid: profile.uid,
        userEmail: profile.email,
        coinId: selectedCoin.id,
        symbol: selectedCoin.symbol,
        coinName: selectedCoin.name,
        direction,
        amount: Number(numericAmount.toFixed(2)),
        profitRate: serverOrder.profitRate,
        entryPrice: serverOrder.entryPrice,
        durationSeconds,
        startedAtMs: serverOrder.startedAtMs,
        lockAtMs: serverOrder.lockAtMs,
        expiresAtMs: serverOrder.expiresAtMs,
        currentAvailableBalance: profile.availableBalance,
        currentTradingBalance: profile.tradingBalance,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to execute simulated trade');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Simulated Futures Disclosure Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white">
            Demo Futures Trading
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Simulated trading environment · Fixed 30% contract profit rate · Server-timed settlement
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-slate-400">Available: </span>
            <span className="text-white font-semibold tabular-nums">
              {formatUsd(profile.availableBalance)}
            </span>
          </div>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <div>
            <span className="text-slate-400">In Positions: </span>
            <span className="text-blue-400 font-semibold tabular-nums">
              {formatUsd(profile.tradingBalance)}
            </span>
          </div>
        </div>
      </div>

      {/* KYC Gate Alert */}
      {!kycApproved && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-white">
                KYC Approval Required to Trade
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Your verification status is currently{' '}
                <span className="font-mono text-amber-300">
                  {profile.kycStatus.replace('_', ' ')}
                </span>
                . Complete sample KYC verification on your Profile page before opening futures positions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-xs font-medium text-amber-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Verify KYC Now
          </button>
        </div>
      )}

      {/* Post-Expiry Revealed Result Banner */}
      {bannerResult && (
        <div
          className={`rounded-2xl border p-4 flex items-center justify-between gap-4 ${
            bannerResult.result === 'WIN'
              ? 'border-emerald-500/35 bg-emerald-500/10'
              : 'border-rose-500/35 bg-rose-500/10'
          }`}
        >
          <div className="flex items-center gap-3">
            {bannerResult.result === 'WIN' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <div className="text-xs sm:text-sm">
              <span className="font-semibold text-white">
                {bannerResult.symbol}/USD Contract Settled — {bannerResult.result}
              </span>
              <p className="text-slate-300 font-mono mt-0.5">
                {bannerResult.result === 'WIN'
                  ? `Total Payout: ${formatUsd(bannerResult.payout)} (+${formatUsd(bannerResult.netPnl)} profit)`
                  : `Simulated Stake Deducted: ${formatUsd(Math.abs(bannerResult.netPnl))}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBannerResult(null)}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Terminal Split: Chart + Order Ticket */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Coin Selector & TradingView Chart */}
        <section className="lg:col-span-8 rounded-2xl border border-white/[0.08] bg-[#0B1120] p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {selectedCoin && (
                <CoinLogo
                  src={selectedCoin.image}
                  symbol={selectedCoin.symbol}
                  name={selectedCoin.name}
                  size={38}
                />
              )}
              <div>
                <select
                  aria-label="Select cryptocurrency contract"
                  value={selectedCoin?.id || selectedCoinId}
                  onChange={(e) => onSelectCoinId(e.target.value)}
                  className="bg-[#060913] border border-white/15 rounded-xl px-3 py-1.5 text-sm font-semibold text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {markets.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.symbol.toUpperCase()}/USD)
                    </option>
                  ))}
                </select>
                {selectedCoin && (
                  <div className="flex items-center gap-2.5 mt-1 text-xs font-mono tabular-nums">
                    <span className="text-base font-semibold text-white">
                      {formatCryptoPrice(selectedCoin.current_price)}
                    </span>
                    <span
                      className={
                        (selectedCoin.price_change_percentage_24h ?? 0) >= 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }
                    >
                      {formatPct(selectedCoin.price_change_percentage_24h)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {selectedCoin && (
              <div className="flex items-center gap-4 text-xs font-mono text-slate-400 tabular-nums">
                <div>
                  <span>24h High: </span>
                  <span className="text-slate-200">{formatCryptoPrice(selectedCoin.high_24h)}</span>
                </div>
                <div>
                  <span>24h Low: </span>
                  <span className="text-slate-200">{formatCryptoPrice(selectedCoin.low_24h)}</span>
                </div>
              </div>
            )}
          </div>

          {selectedCoin ? (
            <LightweightCandleChart
              coinId={selectedCoin.id}
              symbol={selectedCoin.symbol}
              height={340}
            />
          ) : (
            <div className="h-[340px] rounded-xl bg-[#060913] animate-pulse" />
          )}
        </section>

        {/* Right: Simulated Futures Execution Ticket */}
        <section className="lg:col-span-4 rounded-2xl border border-white/[0.08] bg-[#0B1120] p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
            <h2 className="font-display text-base font-semibold text-white">
              Demo Order Ticket
            </h2>
            <span className="text-xs font-mono text-emerald-400">+30% Return</span>
          </div>

          {/* Duration Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              Contract Duration
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {FUTURES_DURATIONS.map((d) => (
                <button
                  key={d.seconds}
                  type="button"
                  onClick={() => setDurationSeconds(d.seconds)}
                  className={`py-2 px-2 rounded-xl text-xs font-mono border transition-colors cursor-pointer ${
                    durationSeconds === d.seconds
                      ? 'bg-blue-600 border-blue-500 text-white font-semibold'
                      : 'bg-[#060913] border-white/[0.08] text-slate-300 hover:border-white/20'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Trading Amount */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="futures-amount" className="font-medium text-slate-300">
                Simulated Stake (USD)
              </label>
              <span className="font-mono text-slate-400 tabular-nums">
                Avail: {formatUsd(profile.availableBalance)}
              </span>
            </div>
            <input
              ref={orderTicketRef}
              id="futures-amount"
              type="number"
              min={1}
              step="1"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-base font-mono font-semibold text-white focus:outline-none focus:border-blue-500 tabular-nums"
            />
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: '$50', val: 50 },
                { label: '$100', val: 100 },
                { label: '$500', val: 500 },
                {
                  label: '50%',
                  val: Math.max(1, Math.floor(profile.availableBalance * 0.5)),
                },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setAmountInput(String(preset.val))}
                  className="py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-mono text-slate-300 cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Profit Calculation Preview */}
          <div className="rounded-xl bg-[#060913] border border-white/[0.08] p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Demo Profit Rate</span>
              <span className="font-mono text-emerald-400 font-semibold">30.00%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Winning Profit</span>
              <span className="font-mono text-emerald-400 tabular-nums">
                +{formatUsd(estProfit)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
              <span className="text-slate-200 font-medium">Total Win Return</span>
              <span className="font-mono text-white font-semibold tabular-nums">
                {formatUsd(estTotalReturn)}
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* UP / LONG and DOWN / SHORT CTAs */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              disabled={!kycApproved || submitting !== null}
              onClick={() => void handlePlaceTrade('LONG')}
              className="min-h-[48px] px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ArrowUp className="w-4 h-4" />
              <span>{submitting === 'LONG' ? 'Placing...' : 'UP / LONG'}</span>
            </button>

            <button
              type="button"
              disabled={!kycApproved || submitting !== null}
              onClick={() => void handlePlaceTrade('SHORT')}
              className="min-h-[48px] px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-45 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ArrowDown className="w-4 h-4" />
              <span>{submitting === 'SHORT' ? 'Placing...' : 'DOWN / SHORT'}</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-500 text-center">
            Simulated trading only. Results are revealed strictly after the server countdown expires.
          </p>
        </section>
      </div>

      {/* Active Trades with Server Countdown */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#0B1120] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Active Trades ({activeTrades.length})
            </h2>
            <p className="text-xs text-slate-400">
              Outcomes remain sealed until the countdown timer reaches zero
            </p>
          </div>
        </div>

        {activeTrades.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No active demo futures positions open.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {activeTrades.map((trade) => {
              const remainingMs = Math.max(0, trade.expiresAtMs - currentServerMs);
              const totalMs = Math.max(1000, trade.expiresAtMs - trade.startedAtMs);
              const progressPct = Math.min(100, Math.max(0, ((totalMs - remainingMs) / totalMs) * 100));
              const isLocked = currentServerMs >= trade.lockAtMs;

              return (
                <div
                  key={trade.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 text-sm font-semibold text-white">
                      <span>{trade.symbol}/USD</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span
                        className={`font-mono text-xs ${
                          trade.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {trade.direction === 'LONG' ? 'UP / LONG' : 'DOWN / SHORT'}
                      </span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="font-mono text-xs text-slate-400">
                        {formatDurationLabel(trade.durationSeconds)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400 tabular-nums">
                      <span>Stake: {formatUsd(trade.amount)}</span>
                      <span aria-hidden="true">·</span>
                      <span>Entry: {formatCryptoPrice(trade.entryPrice)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{isLocked ? 'Round Locked' : 'Open Window'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-36 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-blue-400" />
                          <span>Countdown</span>
                        </span>
                        <span className="text-white font-semibold tabular-nums">
                          {remainingMs > 0 ? formatCountdown(remainingMs) : 'Settling...'}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Detailed Trade History View */}
      <FuturesTradeHistory
        settledTrades={settledTrades}
        onFocusOrderTicket={() => {
          orderTicketRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          orderTicketRef.current?.focus();
        }}
      />
    </div>
  );
}
