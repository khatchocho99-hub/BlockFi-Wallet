import {
  CandlestickChart,
  Home,
  LineChart,
  User,
  Wallet,
} from 'lucide-react';
import type { NavTab } from '../types/exchange';

interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

const NAV_ITEMS: { id: NavTab; label: string; icon: typeof Home; isCenter?: boolean }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'markets', label: 'Markets', icon: LineChart },
  { id: 'futures', label: 'Futures', icon: CandlestickChart, isCenter: true },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
  { id: 'profile', label: 'Profile', icon: User },
];

export function BottomNav({ activeTab, onSelectTab }: BottomNavProps) {
  return (
    <nav
      aria-label="Primary Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.08] bg-[#070B16]/90 backdrop-blur-xl"
    >
      <div className="max-w-3xl mx-auto grid grid-cols-5 items-center h-16 px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;

          if (item.isCenter) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center justify-center min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl group"
              >
                <span
                  className={`flex items-center justify-center w-10 h-10 -mt-3 rounded-xl border transition-all duration-150 ${
                    active
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-600 border-blue-400/50 text-white shadow-lg shadow-blue-600/25'
                      : 'bg-[#111A30] border-white/15 text-blue-300 group-hover:border-blue-400/40 group-hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <span
                  className={`text-[11px] font-medium mt-0.5 whitespace-nowrap ${
                    active ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center min-h-[44px] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                active ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-medium mt-1 whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
