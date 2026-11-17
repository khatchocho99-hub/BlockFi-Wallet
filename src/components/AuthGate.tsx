import { ArrowRight, Lock, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export function AuthGate() {
  const {
    firebaseUser,
    needsRegistration,
    authError,
    clearAuthError,
    signInWithGoogle,
    completeRegistration,
    logout,
  } = useAuth();

  const [username, setUsername] = useState(() => {
    const raw = firebaseUser?.displayName || firebaseUser?.email?.split('@')[0] || '';
    return raw.slice(0, 40);
  });
  const [acceptedDemoTerms, setAcceptedDemoTerms] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const clean = username.trim();
    if (clean.length < 2 || clean.length > 60) {
      setFormError('Username must be between 2 and 60 characters.');
      return;
    }
    if (!acceptedDemoTerms) {
      setFormError('Please acknowledge the simulated trading disclosure to continue.');
      return;
    }
    setSubmitting(true);
    try {
      await completeRegistration(clean);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 rounded-2xl overflow-hidden border border-white/[0.08] bg-[#0B1120] shadow-2xl">
        {/* Left Visual Institutional Showcase */}
        <div className="lg:col-span-7 relative min-h-[260px] lg:min-h-[540px] flex flex-col justify-between p-8 sm:p-10 overflow-hidden bg-[#070B16]">
          <img
            src="/src/assets/images/auth_vault_hero_1794845461239.jpg"
            alt="Obsidian institutional exchange vault geometry"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-75"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060913] via-[#060913]/55 to-transparent" />

          <div className="relative z-10 flex items-center justify-between">
            <span className="font-display text-xl font-semibold tracking-tight text-white">
              Veltrix Exchange
            </span>
          </div>

          <div className="relative z-10 max-w-lg space-y-4">
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white text-balance leading-tight">
              Institutional Web3 Custody &amp; Simulated Futures Terminal
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Real-time CoinGecko market liquidity, TradingView candlestick analytics, and
              server-verified demo futures execution in a unified dark terminal.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-slate-400">
              <span>Live CoinGecko Pricing</span>
              <span aria-hidden="true">·</span>
              <span>30% Demo Contract Payout</span>
              <span aria-hidden="true">·</span>
              <span>Google Verified Access</span>
            </div>
          </div>
        </div>

        {/* Right Authentication / Registration Panel */}
        <div className="lg:col-span-5 p-8 sm:p-10 flex flex-col justify-center bg-[#0B1120]">
          {!needsRegistration ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="font-display text-2xl font-semibold text-white">
                  Sign in to your account
                </h2>
                <p className="text-sm text-slate-400">
                  Access requires an authenticated <span className="text-slate-200 font-mono">@gmail.com</span> Google account. Returning users automatically restore their portfolio.
                </p>
              </div>

              {authError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 leading-relaxed">
                  {authError}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  clearAuthError();
                  void signInWithGoogle();
                }}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-sm flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-600/20 cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
                  />
                </svg>
                <span>Continue with Google (@gmail.com)</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="pt-4 border-t border-white/[0.08] space-y-2.5 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>Firebase Auth session protection with Gmail-only validation</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Simulated demo environment — no real cryptocurrency transfers</span>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="space-y-1.5">
                <p className="text-xs font-mono text-blue-400">Account Registration</p>
                <h2 className="font-display text-2xl font-semibold text-white">
                  Complete your profile
                </h2>
                <p className="text-xs text-slate-400">
                  Signed in as <span className="text-slate-200 font-mono">{firebaseUser?.email}</span>
                </p>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300">
                  {formError}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="reg-username" className="block text-xs font-medium text-slate-300">
                  Display Username
                </label>
                <input
                  id="reg-username"
                  type="text"
                  required
                  minLength={2}
                  maxLength={60}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your trading handle"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-[#060913] border border-white/[0.08] text-xs text-slate-300 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Initial Demo Allocation</span>
                  <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                    $10,000.00 USD
                  </span>
                </div>
                <p className="text-slate-500">
                  Simulated balance for demo futures &amp; wallet operations. KYC approval is required before placing demo futures contracts.
                </p>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedDemoTerms}
                  onChange={(e) => setAcceptedDemoTerms(e.target.checked)}
                  className="mt-0.5 rounded border-white/20 bg-[#060913] text-blue-600 focus:ring-blue-500"
                />
                <span>
                  I understand Veltrix Exchange provides simulated demo balances and demo futures trading only, and executes no real blockchain transfers.
                </span>
              </label>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-all"
                >
                  {submitting ? 'Creating Account...' : 'Create Account'}
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
