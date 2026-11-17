import { CreditCard, Download, ShieldCheck } from 'lucide-react';

interface SecurityCardMatrixProps {
  cardId: string;
  plainGrid?: Record<string, string>;
  highlightedCoords?: [string, string];
}

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];
const COLS = ['1', '2', '3', '4'];

export function SecurityCardMatrix({
  cardId,
  plainGrid,
  highlightedCoords,
}: SecurityCardMatrixProps) {
  const handleDownloadCard = () => {
    if (!plainGrid) return;
    const lines = [
      `VELTRIX EXCHANGE — PRIVATE ADMINISTRATOR SECURITY CARD`,
      `Card ID: ${cardId}`,
      `Generated: ${new Date().toISOString()}`,
      `KEEP OFFLINE. CODES ARE HASHED SERVER-SIDE AND CANNOT BE RECOVERED.`,
      '',
      '      1      2      3      4',
      ...ROWS.map(
        (r) =>
          `${r}   ${COLS.map((c) => plainGrid[`${r}${c}`] || '----').join('   ')}`
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cardId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-[#0E1528] via-[#0A1020] to-[#060913] p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CreditCard className="w-4 h-4 text-indigo-400 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-white">
              Registered Security Card
            </p>
            <p className="text-[11px] font-mono text-slate-400">{cardId}</p>
          </div>
        </div>

        {plainGrid ? (
          <button
            type="button"
            onClick={handleDownloadCard}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Card</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-indigo-300">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Hashed Matrix</span>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-center border-collapse">
          <thead>
            <tr>
              <th className="py-1.5 px-2 text-[11px] font-mono text-slate-500" />
              {COLS.map((col) => (
                <th
                  key={col}
                  className="py-1.5 px-2 text-[11px] font-mono font-semibold text-slate-400"
                >
                  Col {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row}>
                <td className="py-1.5 px-2 text-[11px] font-mono font-semibold text-slate-400">
                  {row}
                </td>
                {COLS.map((col) => {
                  const coord = `${row}${col}`;
                  const isTarget =
                    highlightedCoords &&
                    (highlightedCoords[0] === coord || highlightedCoords[1] === coord);
                  const value = plainGrid ? plainGrid[coord] : '••••';
                  return (
                    <td key={coord} className="p-1">
                      <div
                        className={`rounded-lg py-1.5 px-2 font-mono text-xs border transition-colors ${
                          isTarget
                            ? 'bg-indigo-600/25 border-indigo-400 text-white font-bold'
                            : plainGrid
                            ? 'bg-[#060913] border-white/10 text-emerald-300 font-semibold'
                            : 'bg-[#060913]/80 border-white/[0.06] text-slate-600'
                        }`}
                      >
                        <span className="block text-[9px] text-slate-500">{coord}</span>
                        <span>{value}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
