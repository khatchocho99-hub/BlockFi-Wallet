import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { fetchCoinOhlc } from '../services/api';

interface LightweightCandleChartProps {
  coinId: string;
  symbol: string;
  height?: number;
}

const TIMEFRAMES = [
  { days: '1', label: '24H' },
  { days: '7', label: '7D' },
  { days: '30', label: '30D' },
  { days: '90', label: '90D' },
];

export function LightweightCandleChart({
  coinId,
  symbol,
  height = 340,
}: LightweightCandleChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [days, setDays] = useState('1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#0A1020' },
        textColor: '#94A3B8',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.06)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.06)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(59, 130, 246, 0.45)', labelBackgroundColor: '#1E293B' },
        horzLine: { color: 'rgba(59, 130, 246, 0.45)', labelBackgroundColor: '#1E293B' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#F43F5E',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#F43F5E',
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && chartRef.current) {
          chartRef.current.applyOptions({ width: entry.contentRect.width });
        }
      }
    });
    resizeObserver.observe(container);

    fetchCoinOhlc(coinId, days)
      .then((raw) => {
        if (cancelled) return;
        const dedup = new Map<number, CandlestickData>();
        for (const row of raw) {
          const timeSec = Math.floor(row[0] / 1000);
          dedup.set(timeSec, {
            time: timeSec as UTCTimestamp,
            open: row[1],
            high: row[2],
            low: row[3],
            close: row[4],
          });
        }
        const sorted = Array.from(dedup.values()).sort(
          (a, b) => Number(a.time) - Number(b.time)
        );
        candleSeries.setData(sorted);
        chart.timeScale().fitContent();
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unable to load chart data');
        setLoading(false);
      });

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [coinId, days, height, reloadTick]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="font-mono font-medium text-slate-200">
            {symbol.toUpperCase()} / USD
          </span>
          <span aria-hidden="true">·</span>
          <span>CoinGecko OHLC</span>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#060913] border border-white/[0.07]">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.days}
              type="button"
              onClick={() => setDays(tf.days)}
              className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 ${
                days === tf.days
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="relative w-full rounded-xl overflow-hidden border border-white/[0.08] bg-[#0A1020]"
        style={{ height }}
      >
        <div ref={containerRef} className="w-full h-full" />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0A1020]/80 backdrop-blur-sm">
            <div className="flex items-center gap-2.5 text-xs text-slate-300 font-mono">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
              <span>Loading {symbol.toUpperCase()} market candles...</span>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0A1020]/90 p-4 text-center">
            <p className="text-sm text-rose-400">{error}</p>
            <button
              type="button"
              onClick={() => setReloadTick((t) => t + 1)}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/15 text-slate-100 transition-colors"
            >
              Retry Chart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
