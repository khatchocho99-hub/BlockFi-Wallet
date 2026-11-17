import { useState } from 'react';

interface CoinLogoProps {
  src?: string;
  symbol: string;
  name: string;
  size?: number;
}

export function CoinLogo({ src, symbol, name, size = 36 }: CoinLogoProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-full bg-[#151E34] border border-white/10 flex items-center justify-center text-xs font-mono font-semibold text-blue-300 shrink-0"
        aria-label={name}
      >
        {symbol.slice(0, 3).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${name} (${symbol.toUpperCase()})`}
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="rounded-full object-cover bg-[#10172A] shrink-0"
    />
  );
}
