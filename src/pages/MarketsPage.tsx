import { CandlestickChart, RefreshCw, Search, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CoinLogo } from '../components/CoinLogo';
import { LightweightCandleChart } from '../components/LightweightCandleChart';
import { SparklineSvg } from '../components/SparklineSvg';
import { formatCryptoPrice, formatPct, formatUsd } from '../lib/format';
import type { MarketCoin } from '../types/exchange';

interface MarketsPageProps {
  markets: MarketCoin[];
  loading: boolean;
  error: string | null;
  favoriteCoins: string[];
  onRefresh: () => void;
  onToggleFavorite: (coinId: string) => Promise<void>;
  onTradeFutures: (coinId: string) => void;
}

export function MarketsPage({
  markets,
  loading,
  error,
  favoriteCoins,
  onRefresh,
  onToggleFavorite,
  onTradeFutures,
}: MarketsPageProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const [selectedCoinId, setSelectedCoinId] = useState<string>('bitcoin');

  const filteredCoins = useMemo(() => {
    const q = search.trim().toLowerCase();
    return markets.filter((c) => {
      if (filter === 'favorites' && !favoriteCoins.includes(c.id)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q);
    });
  }, [markets, search, filter, favoriteCoins]);

  const activeCoin =
    markets.find((c) => c.id === selectedCoinId) || filteredCoins[0] || markets[0] || null;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white">
            Live Cryptocurrency Markets
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Authentic real-time market data powered by CoinGecko API
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search coin or ticker..."
              className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#0B1120] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0B1120] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All Assets
            </button>
            <button
              type="button"
              onClick={() => setFilter('favorites')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === 'favorites'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Favorites ({favoriteCoins.length})
            </button>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh CoinGecko prices"
            className="min-h-[40px] px-3 py-2 rounded-xl border border-white/10 bg-[#0B1120] hover:bg-white/5 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Selected Coin Interactive TradingView Chart Panel */}
      {activeCoin && (
        <section className="rounded-2xl border border-white/[0.08] bg-[#0B1120] p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <CoinLogo
                src={activeCoin.image}
                symbol={activeCoin.symbol}
                name={activeCoin.name}
                size={42}
              />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-xl font-semibold text-white">
                    {activeCoin.name}
                  </h2>
                  <span className="text-xs font-mono text-slate-400">
                    {activeCoin.symbol.toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
                  <span className="text-base font-semibold text-white">
                    {formatCryptoPrice(activeCoin.current_price)}
                  </span>
                  <span
                    className={
                      (activeCoin.price_change_percentage_24h ?? 0) >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }
                  >
                    {formatPct(activeCoin.price_change_percentage_24h)} (24h)
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>MCap {formatUsd(activeCoin.market_cap, true)}</span>
                  <span aria-hidden="true">·</span>
                  <span>Vol {formatUsd(activeCoin.total_volume, true)}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onTradeFutures(activeCoin.id)}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-sm font-medium text-white flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CandlestickChart className="w-4 h-4" />
              <span>Trade {activeCoin.symbol.toUpperCase()} Futures</span>
            </button>
          </div>

          <LightweightCandleChart
            coinId={activeCoin.id}
            symbol={activeCoin.symbol}
            height={300}
          />
        </section>
      )}

      {/* Market Directory Table */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#0B1120] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] text-xs font-medium text-slate-400">
                <th className="py-3.5 px-4 w-10">Fav</th>
                <th className="py-3.5 px-4">Asset</th>
                <th className="py-3.5 px-4 text-right">Price</th>
                <th className="py-3.5 px-4 text-right">24h Change</th>
                <th className="py-3.5 px-4 text-right hidden md:table-cell">Market Cap</th>
                <th className="py-3.5 px-4 text-right hidden lg:table-cell">24h Volume</th>
                <th className="py-3.5 px-4 text-right hidden sm:table-cell">7D Trend</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-sm">
              {filteredCoins.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-400">
                    {loading
                      ? 'Loading live cryptocurrency markets...'
                      : 'No cryptocurrencies match your current search or filter.'}
                  </td>
                </tr>
              ) : (
                filteredCoins.map((coin) => {
                  const isFav = favoriteCoins.includes(coin.id);
                  const positive = (coin.price_change_percentage_24h ?? 0) >= 0;
                  const isSelected = activeCoin?.id === coin.id;
                  return (
                    <tr
                      key={coin.id}
                      onClick={() => setSelectedCoinId(coin.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-500/[0.07]' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => void onToggleFavorite(coin.id)}
                          aria-label={`Toggle ${coin.name} favorite`}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              isFav ? 'text-amber-400 fill-amber-400' : 'text-slate-500'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <CoinLogo src={coin.image} symbol={coin.symbol} name={coin.name} size={32} />
                          <div>
                            <p className="font-medium text-white">{coin.name}</p>
                            <p className="text-xs font-mono text-slate-400">
                              {coin.symbol.toUpperCase()}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-medium text-white tabular-nums">
                        {formatCryptoPrice(coin.current_price)}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-mono tabular-nums ${
                          positive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatPct(coin.price_change_percentage_24h)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-300 tabular-nums hidden md:table-cell">
                        {formatUsd(coin.market_cap, true)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-300 tabular-nums hidden lg:table-cell">
                        {formatUsd(coin.total_volume, true)}
                      </td>
                      <td className="py-3.5 px-4 hidden sm:table-cell">
                        <div className="flex justify-end">
                          <SparklineSvg
                            prices={coin.sparkline_in_7d?.price}
                            positive={positive}
                            width={92}
                            height={26}
                          />
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onTradeFutures(coin.id)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 border border-blue-500/30 text-xs font-medium text-blue-200 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Futures
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
