import { ArrowUpDown, ChevronDown, ChevronUp, Download, Search } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import {
  formatCryptoPrice,
  formatDurationLabel,
  formatPct,
  formatTimestamp,
  formatUsd,
} from '../lib/format';
import type { FuturesTrade } from '../types/exchange';

interface FuturesTradeHistoryProps {
  settledTrades: FuturesTrade[];
  onFocusOrderTicket?: () => void;
}

type OutcomeFilter = 'ALL' | 'WIN' | 'LOSE';
type SideFilter = 'ALL' | 'LONG' | 'SHORT';
type SortField = 'closedAt' | 'amount' | 'netPnl';
type SortDir = 'desc' | 'asc';

export function FuturesTradeHistory({
  settledTrades,
  onFocusOrderTicket,
}: FuturesTradeHistoryProps) {
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('ALL');
  const [sideFilter, setSideFilter] = useState<SideFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('closedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const summary = useMemo(() => {
    const total = settledTrades.length;
    let wins = 0;
    let totalVolume = 0;
    let totalPnl = 0;

    for (const t of settledTrades) {
      if (t.result === 'WIN') wins += 1;
      totalVolume += t.amount;
      totalPnl += t.netPnl;
    }

    const winRate = total > 0 ? (wins / total) * 100 : 0;
    return {
      total,
      wins,
      losses: total - wins,
      winRate,
      totalVolume,
      totalPnl,
    };
  }, [settledTrades]);

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = settledTrades.filter((t) => {
      if (outcomeFilter !== 'ALL' && t.result !== outcomeFilter) return false;
      if (sideFilter !== 'ALL' && t.direction !== sideFilter) return false;
      if (q) {
        const hay = `${t.symbol} ${t.coinName} ${t.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'closedAt') {
        cmp = (a.expiresAtMs || a.startedAtMs) - (b.expiresAtMs || b.startedAtMs);
      } else if (sortField === 'amount') {
        cmp = a.amount - b.amount;
      } else {
        cmp = a.netPnl - b.netPnl;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [settledTrades, outcomeFilter, sideFilter, searchQuery, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const resetFilters = () => {
    setOutcomeFilter('ALL');
    setSideFilter('ALL');
    setSearchQuery('');
  };

  const handleExportCsv = () => {
    if (filteredAndSorted.length === 0) return;
    const headers = [
      'Contract ID',
      'Symbol',
      'Name',
      'Duration',
      'Direction',
      'Stake (USD)',
      'Entry Price (USD)',
      'Exit Price (USD)',
      'Price Move (%)',
      'Result',
      'Payout (USD)',
      'Net PnL (USD)',
      'Opened At',
      'Closed At',
    ];
    const rows = filteredAndSorted.map((t) => {
      const movePct = t.entryPrice > 0 ? ((t.exitPrice - t.entryPrice) / t.entryPrice) * 100 : 0;
      return [
        t.id,
        `${t.symbol}/USD`,
        t.coinName,
        formatDurationLabel(t.durationSeconds),
        t.direction,
        t.amount.toFixed(2),
        String(t.entryPrice),
        String(t.exitPrice),
        movePct.toFixed(4),
        t.result,
        t.payout.toFixed(2),
        t.netPnl.toFixed(2),
        new Date(t.startedAtMs).toISOString(),
        new Date(t.expiresAtMs || t.startedAtMs).toISOString(),
      ];
    });
    const csv = [headers, ...rows]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veltrix-trade-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters =
    outcomeFilter !== 'ALL' || sideFilter !== 'ALL' || searchQuery.trim().length > 0;

  return (
    <section
      aria-labelledby="trade-history-heading"
      className="rounded-2xl border border-white/[0.08] bg-[#0B1120] overflow-hidden"
    >
      {/* Header & Derived Closed-Position Metrics */}
      <div className="p-5 border-b border-white/[0.08] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2
              id="trade-history-heading"
              className="font-display text-base sm:text-lg font-semibold text-white"
            >
              Trade History
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Closed demo futures positions · {filteredAndSorted.length} of {settledTrades.length} contracts shown
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-mono tabular-nums">
            <div>
              <span className="text-slate-400">Closed: </span>
              <span className="text-white font-semibold">{summary.total}</span>
            </div>
            <span aria-hidden="true" className="text-slate-700">·</span>
            <div>
              <span className="text-slate-400">Win Rate: </span>
              <span className="text-slate-100 font-semibold">
                {summary.winRate.toFixed(1)}%
              </span>
              <span className="text-slate-500 ml-1">
                ({summary.wins}W/{summary.losses}L)
              </span>
            </div>
            <span aria-hidden="true" className="text-slate-700">·</span>
            <div>
              <span className="text-slate-400">Volume: </span>
              <span className="text-slate-100 font-semibold">
                {formatUsd(summary.totalVolume)}
              </span>
            </div>
            <span aria-hidden="true" className="text-slate-700">·</span>
            <div>
              <span className="text-slate-400">Realized PnL: </span>
              <span
                className={`font-semibold ${
                  summary.totalPnl > 0
                    ? 'text-emerald-400'
                    : summary.totalPnl < 0
                    ? 'text-rose-400'
                    : 'text-slate-200'
                }`}
              >
                {summary.totalPnl > 0 ? '+' : ''}
                {formatUsd(summary.totalPnl)}
              </span>
            </div>
          </div>
        </div>

        {/* Filter, Search & Export Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Outcome Segmented Filter */}
            <div
              role="group"
              aria-label="Filter by trade outcome"
              className="inline-flex items-center p-1 rounded-xl bg-[#060913] border border-white/[0.08]"
            >
              {(
                [
                  { id: 'ALL', label: 'All' },
                  { id: 'WIN', label: 'Wins' },
                  { id: 'LOSE', label: 'Losses' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setOutcomeFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    outcomeFilter === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Direction Segmented Filter */}
            <div
              role="group"
              aria-label="Filter by direction"
              className="inline-flex items-center p-1 rounded-xl bg-[#060913] border border-white/[0.08]"
            >
              {(
                [
                  { id: 'ALL', label: 'All Sides' },
                  { id: 'LONG', label: 'UP / LONG' },
                  { id: 'SHORT', label: 'DOWN / SHORT' },
                ] as const
              ).map((side) => (
                <button
                  key={side.id}
                  type="button"
                  onClick={() => setSideFilter(side.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    sideFilter === side.id
                      ? 'bg-white/12 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {side.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search pair or ID..."
                aria-label="Search closed trades"
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#060913] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="button"
              disabled={filteredAndSorted.length === 0}
              onClick={handleExportCsv}
              className="min-h-[36px] px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-40 disabled:cursor-not-allowed border border-white/[0.08] text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Closed Positions Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08] text-xs font-medium text-slate-400 bg-[#060913]/40">
              <th className="py-3 px-4">Position</th>
              <th className="py-3 px-4">Side</th>
              <th className="py-3 px-4 text-right">
                <button
                  type="button"
                  onClick={() => toggleSort('amount')}
                  className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                >
                  <span>Stake</span>
                  <ArrowUpDown className="w-3 h-3 opacity-70" />
                </button>
              </th>
              <th className="py-3 px-4 text-right">Entry Price</th>
              <th className="py-3 px-4 text-right">Exit Price</th>
              <th className="py-3 px-4 text-right">Outcome</th>
              <th className="py-3 px-4 text-right">Payout</th>
              <th className="py-3 px-4 text-right">
                <button
                  type="button"
                  onClick={() => toggleSort('netPnl')}
                  className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                >
                  <span>PnL</span>
                  <ArrowUpDown className="w-3 h-3 opacity-70" />
                </button>
              </th>
              <th className="py-3 px-4 text-right">
                <button
                  type="button"
                  onClick={() => toggleSort('closedAt')}
                  className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                >
                  <span>Closed</span>
                  <ArrowUpDown className="w-3 h-3 opacity-70" />
                </button>
              </th>
              <th className="py-3 px-3 w-10" aria-label="Details" />
            </tr>
          </thead>

          <tbody className="divide-y divide-white/[0.06] text-xs sm:text-sm">
            {settledTrades.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-10 px-4 text-center">
                  <div className="space-y-2 max-w-md mx-auto">
                    <p className="text-sm font-medium text-slate-200">
                      No closed positions yet
                    </p>
                    <p className="text-xs text-slate-400">
                      Once a simulated futures contract countdown expires, its entry price, exit price, and realized PnL will be recorded here.
                    </p>
                    {onFocusOrderTicket && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={onFocusOrderTicket}
                          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white cursor-pointer"
                        >
                          Open First Position
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ) : filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-10 px-4 text-center">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-300">
                      No closed positions match your current filters
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((trade) => {
                const isWin = trade.result === 'WIN';
                const isExpanded = expandedId === trade.id;
                const priceDiff = trade.exitPrice - trade.entryPrice;
                const priceMovePct =
                  trade.entryPrice > 0 ? (priceDiff / trade.entryPrice) * 100 : 0;
                const roiPct = trade.amount > 0 ? (trade.netPnl / trade.amount) * 100 : 0;

                return (
                  <Fragment key={trade.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : trade.id)}
                      className="hover:bg-white/[0.025] transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-white whitespace-nowrap">
                          {trade.symbol}/USD{' '}
                          <span className="text-slate-500 font-normal">·</span>{' '}
                          <span className="font-mono text-xs text-slate-300">
                            {formatDurationLabel(trade.durationSeconds)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[160px]">
                          {trade.coinName}
                        </div>
                      </td>

                      <td
                        className={`py-3.5 px-4 font-mono text-xs font-medium whitespace-nowrap ${
                          trade.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {trade.direction === 'LONG' ? 'UP / LONG' : 'DOWN / SHORT'}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-slate-200 tabular-nums whitespace-nowrap">
                        {formatUsd(trade.amount)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-slate-300 tabular-nums whitespace-nowrap">
                        {formatCryptoPrice(trade.entryPrice)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="text-white">{formatCryptoPrice(trade.exitPrice)}</div>
                        <div
                          className={`text-[11px] ${
                            priceMovePct > 0
                              ? 'text-emerald-400'
                              : priceMovePct < 0
                              ? 'text-rose-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {formatPct(priceMovePct)}
                        </div>
                      </td>

                      <td
                        className={`py-3.5 px-4 text-right font-mono text-xs font-semibold whitespace-nowrap ${
                          isWin ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {trade.result}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-slate-200 tabular-nums whitespace-nowrap">
                        {formatUsd(trade.payout)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div
                          className={`font-semibold ${
                            isWin ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {trade.netPnl >= 0 ? '+' : ''}
                          {formatUsd(trade.netPnl)}
                        </div>
                        <div
                          className={`text-[11px] ${
                            isWin ? 'text-emerald-400/80' : 'text-rose-400/80'
                          }`}
                        >
                          {roiPct >= 0 ? '+' : ''}
                          {roiPct.toFixed(1)}% ROI
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right text-xs font-mono text-slate-400 whitespace-nowrap">
                        {formatTimestamp(trade.settledAt ?? trade.expiresAtMs)}
                      </td>

                      <td className="py-3.5 px-3 text-right text-slate-500">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 inline-block" />
                        ) : (
                          <ChevronDown className="w-4 h-4 inline-block" />
                        )}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-[#060913]/65">
                        <td colSpan={10} className="px-4 py-3.5 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-mono text-slate-400 tabular-nums">
                            <div>
                              <span>Contract ID: </span>
                              <span className="text-slate-200">{trade.id}</span>
                            </div>
                            <div>
                              <span>Opened: </span>
                              <span className="text-slate-200">
                                {formatTimestamp(trade.startedAtMs)}
                              </span>
                            </div>
                            <div>
                              <span>Price Delta: </span>
                              <span
                                className={
                                  priceDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }
                              >
                                {priceDiff > 0 ? '+' : priceDiff < 0 ? '-' : ''}
                                {formatCryptoPrice(Math.abs(priceDiff))} ({formatPct(priceMovePct)})
                              </span>
                            </div>
                            <div>
                              <span>Contract Rate: </span>
                              <span className="text-slate-200">
                                {(trade.profitRate * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="truncate max-w-[260px]">
                              <span>Settlement Proof: </span>
                              <span className="text-slate-300">
                                {trade.settlementSignature}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
