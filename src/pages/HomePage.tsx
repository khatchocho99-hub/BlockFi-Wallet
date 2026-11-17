import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CandlestickChart,
  ShieldAlert,
  Star,
  Wallet,
} from 'lucide-react';
import { CoinLogo } from '../components/CoinLogo';
import { SparklineSvg } from '../components/SparklineSvg';
import {
  formatCryptoPrice,
  formatDurationLabel,
  formatPct,
  formatTimestamp,
  formatUsd,
} from '../lib/format';
import type { FuturesTrade, MarketCoin, NavTab, UserProfile } from '../types/exchange';

interface HomePageProps {
  profile: UserProfile;
  markets: MarketCoin[];
  marketsLoading: boolean;
  trades: FuturesTrade[];
  onNavigate: (tab: NavTab) => void;
  onSelectCoinForFutures: (coinId: string) => void;
  onToggleFavorite: (coinId: string) => Promise<void>;
}

export function HomePage({
  profile,
  markets,
  marketsLoading,
  trades,
  onNavigate,
  onSelectCoinForFutures,
  onToggleFavorite,
}: HomePageProps) {
  const totalDemoBalance = Number(
    (profile.availableBalance + profile.tradingBalance).toFixed(2)
  );
  const favoriteCoins = markets.filter((c) => profile.favoriteCoins.includes(c.id));
  const marketOverview = markets.slice(0, 8);
  const recentTrades = trades.slice(0, 6);

  return (
    <div className="space-y-8">
      {/* Portfolio Summary Header Card */}
      <section className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0D1528] via-[#0A1020] to-[#080C18] p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>Simulated Demo Portfolio</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-300">{profile.accountId}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  profile.kycStatus === 'APPROVED'
                    ? 'text-emerald-400'
                    : profile.kycStatus === 'PENDING'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }
              >
                KYC {profile.kycStatus.replace('_', ' ')}
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white font-mono tabular-nums">
                {formatUsd(totalDemoBalance)}
              </h1>
              <span className="text-xs text-slate-400">Total Demo Balance</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('wallet')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-sm font-medium text-slate-100 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Wallet className="w-4 h-4 text-blue-400" />
              <span>Wallet &amp; Transfers</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('futures')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-sm font-medium text-white flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CandlestickChart className="w-4 h-4" />
              <span>Trade Demo Futures</span>
            </button>
          </div>
        </div>

        {/* 4-Column Metric Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-7 pt-6 border-t border-white/[0.08]">
          <div>
            <p className="text-xs text-slate-400">Total Demo Balance</p>
            <p className="mt-1 text-lg sm:text-xl font-mono font-semibold text-white tabular-nums">
              {formatUsd(totalDemoBalance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Available Balance</p>
            <p className="mt-1 text-lg sm:text-xl font-mono font-semibold text-slate-100 tabular-nums">
              {formatUsd(profile.availableBalance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Trading Balance</p>
            <p className="mt-1 text-lg sm:text-xl font-mono font-semibold text-blue-400 tabular-nums">
              {formatUsd(profile.tradingBalance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Total Profit &amp; Loss</p>
            <p
              className={`mt-1 text-lg sm:text-xl font-mono font-semibold tabular-nums flex items-center gap-1 ${
                profile.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {profile.totalPnl >= 0 ? (
                <ArrowUpRight className="w-4 h-4 shrink-0" />
              ) : (
                <ArrowDownRight className="w-4 h-4 shrink-0" />
              )}
              <span>
                {profile.totalPnl >= 0 ? '+' : ''}
                {formatUsd(profile.totalPnl)}
              </span>
            </p>
          </div>
        </div>
      </section>

      {profile.kycStatus !== 'APPROVED' && (
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-white">
                Identity Verification Required for Futures
              </h2>
              <p className="text-xs text-slate-300">
                Current KYC status: <span className="font-mono text-amber-300">{profile.kycStatus.replace('_', ' ')}</span>. Submit sample KYC documents in your Profile to unlock simulated futures trading.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-xs font-medium text-amber-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Go to KYC Verification
          </button>
        </section>
      )}

      {/* Favorite Coins Watchlist */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Favorite Coins</h2>
            <p className="text-xs text-slate-400">Your pinned live CoinGecko markets</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('markets')}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
          >
            <span>All Markets</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {favoriteCoins.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 text-center space-y-2">
            <p className="text-sm text-slate-300">No favorite coins pinned yet.</p>
            <button
              type="button"
              onClick={() => onNavigate('markets')}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/15 text-white cursor-pointer"
            >
              Browse Markets to Add Favorites
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {favoriteCoins.map((coin) => {
              const positive = (coin.price_change_percentage_24h ?? 0) >= 0;
              return (
                <div
                  key={coin.id}
                  className="rounded-2xl border border-white/[0.08] bg-[#0B1120] hover:border-blue-500/35 p-4 transition-colors flex flex-col justify-between gap-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <CoinLogo src={coin.image} symbol={coin.symbol} name={coin.name} size={36} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{coin.name}</p>
                        <p className="text-xs font-mono text-slate-400">
                          {coin.symbol.toUpperCase()} / USD
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onToggleFavorite(coin.id)}
                      aria-label={`Remove ${coin.name} from favorites`}
                      className="p-2 rounded-lg text-amber-400 hover:bg-white/5 cursor-pointer"
                    >
                      <Star className="w-4 h-4 fill-amber-400" />
                    </button>
                  </div>

                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-lg font-mono font-semibold text-white tabular-nums">
                        {formatCryptoPrice(coin.current_price)}
                      </p>
                      <p
                        className={`text-xs font-mono tabular-nums ${
                          positive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatPct(coin.price_change_percentage_24h)} · 24h
                      </p>
                    </div>
                    <SparklineSvg
                      prices={coin.sparkline_in_7d?.price}
                      positive={positive}
                      width={88}
                      height={28}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectCoinForFutures(coin.id)}
                    className="w-full py-2 rounded-xl bg-white/[0.04] hover:bg-blue-600/20 border border-white/[0.08] hover:border-blue-500/40 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                  >
                    Open {coin.symbol.toUpperCase()} Futures
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Market Overview & Recent Activity Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Cryptocurrency Market Overview */}
        <section className="xl:col-span-7 rounded-2xl border border-white/[0.08] bg-[#0B1120] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Market Overview
              </h2>
              <p className="text-xs text-slate-400">Real-time CoinGecko spot benchmarks</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('markets')}
              className="text-xs font-medium text-blue-400 hover:text-blue-300 cursor-pointer"
            >
              View All
            </button>
          </div>

          {marketsLoading && markets.length === 0 ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-white/[0.03] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {marketOverview.map((coin) => {
                const positive = (coin.price_change_percentage_24h ?? 0) >= 0;
                return (
                  <div
                    key={coin.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <CoinLogo src={coin.image} symbol={coin.symbol} name={coin.name} size={32} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{coin.name}</p>
                        <p className="text-xs font-mono text-slate-400">
                          {coin.symbol.toUpperCase()}
                        </p>
                      </div>
                    </div>

                    <div className="hidden sm:block">
                      <SparklineSvg
                        prices={coin.sparkline_in_7d?.price}
                        positive={positive}
                        width={84}
                        height={24}
                      />
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-mono font-medium text-white tabular-nums">
                        {formatCryptoPrice(coin.current_price)}
                      </p>
                      <p
                        className={`text-xs font-mono tabular-nums ${
                          positive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatPct(coin.price_change_percentage_24h)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectCoinForFutures(coin.id)}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-blue-600 text-xs font-medium text-slate-200 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Trade
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent Trading Activity */}
        <section className="xl:col-span-5 rounded-2xl border border-white/[0.08] bg-[#0B1120] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Recent Trading Activity
              </h2>
              <p className="text-xs text-slate-400">Latest simulated demo contracts</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('futures')}
              className="text-xs font-medium text-blue-400 hover:text-blue-300 cursor-pointer"
            >
              Futures
            </button>
          </div>

          {recentTrades.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-slate-300">No demo futures trades recorded yet.</p>
              <p className="text-xs text-slate-500">
                Complete KYC verification and open your first 30% payout demo contract.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('futures')}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white cursor-pointer"
              >
                Open Futures Terminal
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {recentTrades.map((trade) => {
                const isWin = trade.result === 'WIN';
                const isLose = trade.result === 'LOSE';
                return (
                  <div key={trade.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        <span>{trade.symbol}/USD</span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span
                          className={`text-xs font-mono ${
                            trade.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {trade.direction === 'LONG' ? 'UP / LONG' : 'DOWN / SHORT'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-mono">
                        {formatUsd(trade.amount)} · {formatDurationLabel(trade.durationSeconds)} ·{' '}
                        {formatTimestamp(trade.startedAtMs)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-mono font-semibold tabular-nums ${
                          isWin
                            ? 'text-emerald-400'
                            : isLose
                            ? 'text-rose-400'
                            : 'text-blue-400'
                        }`}
                      >
                        {trade.status === 'ACTIVE'
                          ? 'Active'
                          : `${trade.netPnl >= 0 ? '+' : ''}${formatUsd(trade.netPnl)}`}
                      </p>
                      <p className="text-xs text-slate-400 font-mono">{trade.result}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
