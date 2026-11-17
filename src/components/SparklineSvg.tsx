interface SparklineSvgProps {
  prices?: number[];
  positive: boolean;
  width?: number;
  height?: number;
}

export function SparklineSvg({
  prices,
  positive,
  width = 104,
  height = 32,
}: SparklineSvgProps) {
  if (!prices || prices.length < 2) {
    return <div style={{ width, height }} className="opacity-20 border-b border-slate-700" />;
  }

  // Sample down to ~28 points for clean SVG rendering
  const step = Math.max(1, Math.floor(prices.length / 28));
  const sampled = prices.filter((_, idx) => idx % step === 0);
  if (sampled.length < 2) return null;

  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const range = max - min || 1;
  const pad = 2;

  const points = sampled
    .map((val, i) => {
      const x = (i / (sampled.length - 1)) * width;
      const y = height - pad - ((val - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const stroke = positive ? '#10B981' : '#F43F5E';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className="overflow-visible shrink-0"
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
