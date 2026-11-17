import { MotionConfig, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { AuthGate } from './components/AuthGate';
import { BottomNav } from './components/BottomNav';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FuturesPage } from './pages/FuturesPage';
import { HomePage } from './pages/HomePage';
import { MarketsPage } from './pages/MarketsPage';
import { ProfilePage } from './pages/ProfilePage';
import { SecureControlGate } from './pages/SecureControlGate';
import { WalletPage } from './pages/WalletPage';
import { fetchMarkets } from './services/api';
import {
  subscribeUserTrades,
  subscribeUserTransactions,
  subscribeWalletConfigs,
  updateUserPreferences,
} from './services/firestoreService';
import type {
  FuturesTrade,
  MarketCoin,
  NavTab,
  WalletAddressConfig,
  WalletTransaction,
} from './types/exchange';

function CustomerExchangeShell() {
  const {
    firebaseUser,
    profile,
    authLoading,
    profileLoading,
    needsRegistration,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [selectedFuturesCoinId, setSelectedFuturesCoinId] = useState('bitcoin');

  const [markets, setMarkets] = useState<MarketCoin[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [marketsError, setMarketsError] = useState<string | null>(null);

  const [trades, setTrades] = useState<FuturesTrade[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [walletConfigs, setWalletConfigs] = useState<WalletAddressConfig[]>([]);

  const loadMarkets = useCallback(async () => {
    setMarketsLoading(true);
    setMarketsError(null);
    try {
      const res = await fetchMarkets();
      setMarkets(res.coins);
    } catch (err) {
      setMarketsError(err instanceof Error ? err.message : 'Unable to fetch market prices');
    } finally {
      setMarketsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    void loadMarkets();
    const interval = setInterval(() => {
      void loadMarkets();
    }, 35_000);
    return () => clearInterval(interval);
  }, [profile?.uid, loadMarkets]);

  useEffect(() => {
    if (!profile) {
      setTrades([]);
      setTransactions([]);
      setWalletConfigs([]);
      return;
    }
    const unsubTrades = subscribeUserTrades(profile.uid, setTrades);
    const unsubTx = subscribeUserTransactions(profile.uid, setTransactions);
    const unsubWallets = subscribeWalletConfigs(setWalletConfigs);
    return () => {
      unsubTrades();
      unsubTx();
      unsubWallets();
    };
  }, [profile?.uid]);

  const handleToggleFavorite = async (coinId: string) => {
    if (!profile) return;
    const exists = profile.favoriteCoins.includes(coinId);
    const next = exists
      ? profile.favoriteCoins.filter((id) => id !== coinId)
      : [...profile.favoriteCoins, coinId].slice(0, 30);
    await updateUserPreferences(profile.uid, { favoriteCoins: next });
  };

  const handleSelectCoinForFutures = (coinId: string) => {
    setSelectedFuturesCoinId(coinId);
    setActiveTab('futures');
  };

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-[#060913] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-xs font-mono text-slate-400">
            Restoring secure Veltrix session...
          </p>
        </div>
      </div>
    );
  }

  if (!firebaseUser || needsRegistration || !profile) {
    return <AuthGate />;
  }

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 pb-24">
      {/* Compact Brand Bar (Zero admin links, zero notifications) */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#070B16]/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <span className="font-display text-lg font-semibold tracking-tight text-white whitespace-nowrap shrink-0">
            Veltrix Exchange
          </span>

          <span className="text-xs font-mono text-slate-400 whitespace-nowrap shrink-0">
            Demo Environment
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
        >
          {activeTab === 'home' && (
            <HomePage
              profile={profile}
              markets={markets}
              marketsLoading={marketsLoading}
              trades={trades}
              onNavigate={setActiveTab}
              onSelectCoinForFutures={handleSelectCoinForFutures}
              onToggleFavorite={handleToggleFavorite}
            />
          )}
          {activeTab === 'markets' && (
            <MarketsPage
              markets={markets}
              loading={marketsLoading}
              error={marketsError}
              favoriteCoins={profile.favoriteCoins}
              onRefresh={() => void loadMarkets()}
              onToggleFavorite={handleToggleFavorite}
              onTradeFutures={handleSelectCoinForFutures}
            />
          )}
          {activeTab === 'futures' && (
            <FuturesPage
              profile={profile}
              markets={markets}
              selectedCoinId={selectedFuturesCoinId}
              onSelectCoinId={setSelectedFuturesCoinId}
              trades={trades}
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === 'wallet' && (
            <WalletPage
              profile={profile}
              walletConfigs={walletConfigs}
              transactions={transactions}
            />
          )}
          {activeTab === 'profile' && <ProfilePage profile={profile} />}
        </motion.div>
      </main>

      <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} />
    </div>
  );
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const isSecureControlRoute =
    pathname === '/secure-control' || pathname.startsWith('/secure-control/');

  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        {isSecureControlRoute ? <SecureControlGate /> : <CustomerExchangeShell />}
      </AuthProvider>
    </MotionConfig>
  );
}
