import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { SecurityCardMatrix } from '../components/SecurityCardMatrix';
import { useAuth } from '../context/AuthContext';
import { AdminPage } from '../pages/AdminPage';
import {
  beginOwnerVaultSetupApi,
  completeOwnerVaultSetupApi,
  enrollLegacyTotpApi,
  fetchSecureControlPublicStatus,
  fetchSecureControlStatus,
  logoutSecureControl,
  submitAdminStep1Login,
  submitAdminStep2Totp,
  submitAdminStep3Verify,
  type SecureControlPublicStatus,
  type SecureControlStatus,
} from '../services/api';

export function SecureControlGate() {
  const {
    firebaseUser,
    profile,
    authLoading,
    profileLoading,
    isAdmin,
    signInWithGoogle,
    logout,
  } = useAuth();

  const [publicStatus, setPublicStatus] = useState<SecureControlPublicStatus | null>(null);
  const [status, setStatus] = useState<SecureControlStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);

  // One-time Owner Setup state (Email + Password + Mandatory TOTP Enrollment)
  const [setupEmail, setSetupEmail] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupPending, setSetupPending] = useState<{
    setupId: string;
    totpSecret: string;
    otpauthUri: string;
  } | null>(null);
  const [setupTotpCode, setSetupTotpCode] = useState('');
  const [createdCard, setCreatedCard] = useState<{
    cardId: string;
    plainGrid: Record<string, string>;
  } | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);

  // 3-Step Login State (Step 1: Email+Password, Step 2: Mandatory 6-digit TOTP, Step 3: Gmail Identity Session)
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [challenge, setChallenge] = useState<{
    challengeId: string;
    totpRequired: true;
    needsTotpEnrollment: boolean;
    expiresAtMs: number;
  } | null>(null);
  const [legacyEnrollData, setLegacyEnrollData] = useState<{
    secret: string;
    otpauthUri: string;
  } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [verificationNonce, setVerificationNonce] = useState<string | null>(null);
  const [pendingStep3AfterGoogle, setPendingStep3AfterGoogle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setAccessDenied(null);
    try {
      const pub = await fetchSecureControlPublicStatus();
      setPublicStatus(pub);

      if (firebaseUser) {
        try {
          const s = await fetchSecureControlStatus();
          setStatus(s);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unauthorized';
          setAccessDenied(msg);
          setStatus(null);
        }
      } else {
        setStatus(null);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to reach security server.');
    } finally {
      setStatusLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (!authLoading) {
      void loadStatus();
    }
  }, [authLoading, loadStatus]);

  // Auto-expire session in UI when TTL elapses
  useEffect(() => {
    if (!status?.sessionValid || !status.sessionExpiresAtMs) return;
    const msLeft = status.sessionExpiresAtMs - Date.now();
    if (msLeft <= 0) {
      setStatus((prev) => (prev ? { ...prev, sessionValid: false } : prev));
      setStep(1);
      return;
    }
    const timer = setTimeout(() => {
      setStatus((prev) => (prev ? { ...prev, sessionValid: false } : prev));
      setStep(1);
    }, msLeft);
    return () => clearTimeout(timer);
  }, [status?.sessionValid, status?.sessionExpiresAtMs]);

  // If user triggered Google Sign-In during Step 3 and signed in cleanly, finish Step 3 automatically
  useEffect(() => {
    if (
      pendingStep3AfterGoogle &&
      firebaseUser &&
      isAdmin &&
      challenge &&
      verificationNonce &&
      !busy
    ) {
      setPendingStep3AfterGoogle(false);
      setBusy(true);
      void submitAdminStep3Verify({
        challengeId: challenge.challengeId,
        verificationNonce,
      })
        .then(async () => {
          setChallenge(null);
          setVerificationNonce(null);
          setStep(1);
          await loadStatus();
        })
        .catch((err) => {
          setErrorMsg(err instanceof Error ? err.message : 'Step 3 verification failed');
        })
        .finally(() => {
          setBusy(false);
        });
    }
  }, [
    pendingStep3AfterGoogle,
    firebaseUser,
    isAdmin,
    challenge,
    verificationNonce,
    busy,
    loadStatus,
  ]);

  const handleBeginOwnerSetup = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSetupBusy(true);
    try {
      const res = await beginOwnerVaultSetupApi({
        email: setupEmail,
        password: setupPassword,
        confirmPassword: setupConfirm,
      });
      setSetupPending({
        setupId: res.setupId,
        totpSecret: res.totpSecret,
        otpauthUri: res.otpauthUri,
      });
      setSetupPassword('');
      setSetupConfirm('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Initialization failed');
    } finally {
      setSetupBusy(false);
    }
  };

  const handleCompleteOwnerSetup = async (e: FormEvent) => {
    e.preventDefault();
    if (!setupPending) return;
    setErrorMsg(null);
    setSetupBusy(true);
    try {
      const res = await completeOwnerVaultSetupApi({
        setupId: setupPending.setupId,
        totpCode: setupTotpCode,
      });
      setCreatedCard({ cardId: res.cardId, plainGrid: res.plainGrid });
      setSetupPending(null);
      setSetupTotpCode('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authenticator verification failed');
    } finally {
      setSetupBusy(false);
    }
  };

  const handleStep1 = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    try {
      const res = await submitAdminStep1Login({
        email: emailInput,
        password: passwordInput,
      });
      setChallenge(res);
      setPasswordInput('');
      setStep(2);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid email or password');
    } finally {
      setBusy(false);
    }
  };

  const handleStep2 = async (e: FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      if (challenge.needsTotpEnrollment) {
        const res = await enrollLegacyTotpApi({
          action: 'COMPLETE',
          challengeId: challenge.challengeId,
          totpCode,
        });
        if (!res.verificationNonce) throw new Error('Missing verification proof');
        setVerificationNonce(res.verificationNonce);
      } else {
        const res = await submitAdminStep2Totp({
          challengeId: challenge.challengeId,
          totpCode,
        });
        setVerificationNonce(res.verificationNonce);
      }
      setTotpCode('');
      setLegacyEnrollData(null);
      setStep(3);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid 6-digit authenticator code');
    } finally {
      setBusy(false);
    }
  };

  const handleBeginLegacyEnroll = async () => {
    if (!challenge) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      if (!firebaseUser) {
        await signInWithGoogle();
      }
      const res = await enrollLegacyTotpApi({
        action: 'BEGIN',
        challengeId: challenge.challengeId,
      });
      if (res.secret && res.otpauthUri) {
        setLegacyEnrollData({ secret: res.secret, otpauthUri: res.otpauthUri });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to start authenticator enrollment');
    } finally {
      setBusy(false);
    }
  };

  const handleStep3 = async () => {
    if (!challenge || !verificationNonce) return;
    setErrorMsg(null);

    if (!firebaseUser) {
      setPendingStep3AfterGoogle(true);
      await signInWithGoogle();
      return;
    }

    setBusy(true);
    try {
      await submitAdminStep3Verify({
        challengeId: challenge.challengeId,
        verificationNonce,
      });
      setChallenge(null);
      setVerificationNonce(null);
      setEmailInput('');
      setStep(1);
      await loadStatus();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Step 3 verification failed');
    } finally {
      setBusy(false);
    }
  };

  const handleAdminLogout = async () => {
    await logoutSecureControl();
    setStep(1);
    setChallenge(null);
    setVerificationNonce(null);
    setEmailInput('');
    setPasswordInput('');
    setTotpCode('');
    await loadStatus();
  };

  if (authLoading || (firebaseUser && profileLoading) || statusLoading) {
    return (
      <div className="min-h-screen bg-[#060913] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-xs font-mono text-slate-400">
            Verifying security boundary...
          </p>
        </div>
      </div>
    );
  }

  // Immediately block any signed-in non-admin Google account
  if (firebaseUser && (!isAdmin || accessDenied)) {
    return (
      <div className="min-h-screen bg-[#060913] text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-[#0B1120] p-8 space-y-5 text-center">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6 text-rose-400" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-xl font-semibold text-white">
              403 · Unauthorized Access Blocked
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              This route is restricted exclusively to the authorized administrator Gmail account. Your access attempt has been recorded in security logs.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <a
              href="/"
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white"
            >
              Return to Exchange
            </a>
            <button
              type="button"
              onClick={() => void logout()}
              className="px-4 py-2 rounded-xl border border-white/10 text-xs text-slate-300 hover:text-white cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Admin Session Active -> Render Full Private Admin Control Center
  if (status?.sessionValid && profile) {
    return (
      <AdminPage
        currentAdmin={profile}
        isOwner={status.isOwner}
        sessionExpiresAtMs={status.sessionExpiresAtMs}
        sessionTtlMinutes={status.sessionTtlMinutes}
        totpEnabled={status.totpEnabled}
        cardId={status.cardId}
        activeSessionsCount={status.activeSessionsCount}
        onStatusRefresh={loadStatus}
        onLogoutAdmin={handleAdminLogout}
      />
    );
  }

  // One-Time Owner Initialization Flow (Strictly gated; public admin registration disabled)
  if (publicStatus && !publicStatus.initialized) {
    if (!firebaseUser) {
      return (
        <div className="min-h-screen bg-[#060913] text-slate-100 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0B1120] p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/35 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h1 className="font-display text-lg font-semibold text-white">
                  Owner Provisioning Required
                </h1>
                <p className="text-xs text-slate-400">
                  Public administrator registration is disabled
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Sign in with the authorized owner Google account to create your administrator password and bind mandatory 6-digit TOTP two-factor authentication.
            </p>

            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>Verify Owner Google Identity</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#060913] text-slate-100 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-xl rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 sm:p-8 space-y-6">
          <div className="space-y-1.5 border-b border-white/[0.08] pb-4">
            <p className="text-xs font-mono text-indigo-400">One-Time Owner Setup</p>
            <h1 className="font-display text-2xl font-semibold text-white">
              Initialize Admin Credentials &amp; Mandatory 2FA
            </h1>
            <p className="text-xs text-slate-400">
              Your administrator password is hashed with salted scrypt on the server and paired with mandatory RFC 6238 6-digit TOTP authentication.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          {createdCard ? (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 leading-relaxed">
                Administrator password and mandatory 6-digit TOTP authenticator are now active. Save this backup Security Card offline if desired — it is shown once.
              </div>

              <SecurityCardMatrix
                cardId={createdCard.cardId}
                plainGrid={createdCard.plainGrid}
              />

              <button
                type="button"
                onClick={() => {
                  setCreatedCard(null);
                  void loadStatus();
                }}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white cursor-pointer"
              >
                Continue to Admin Login
              </button>
            </div>
          ) : setupPending ? (
            <form onSubmit={handleCompleteOwnerSetup} className="space-y-5">
              <div className="rounded-xl bg-[#060913] border border-white/[0.08] p-4 flex flex-col sm:flex-row items-center gap-4">
                <div className="p-2.5 rounded-xl bg-white shrink-0">
                  <QRCodeSVG value={setupPending.otpauthUri} size={136} />
                </div>
                <div className="space-y-2 text-xs">
                  <p className="font-medium text-white">
                    Scan with Google Authenticator, Authy, or 1Password
                  </p>
                  <p className="text-slate-400 leading-relaxed">
                    Mandatory two-factor authentication protects every admin sign-in. Or enter this Base32 key manually:
                  </p>
                  <p className="font-mono text-indigo-300 break-all select-all">
                    {setupPending.totpSecret}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="setup-totp" className="block text-xs font-medium text-slate-300">
                  Enter Live 6-Digit Authenticator Code to Activate
                </label>
                <input
                  id="setup-totp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  required
                  maxLength={6}
                  autoFocus
                  value={setupTotpCode}
                  onChange={(e) => setSetupTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-base font-mono tracking-[0.35em] text-center text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={setupBusy || setupTotpCode.length !== 6}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-sm font-medium text-white cursor-pointer"
              >
                {setupBusy ? 'Verifying 6-Digit Code...' : 'Verify Authenticator & Activate Vault'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleBeginOwnerSetup} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="setup-email" className="block text-xs font-medium text-slate-300">
                  Confirm Authorized Owner Gmail
                </label>
                <input
                  id="setup-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="Enter your authorized Gmail address"
                  value={setupEmail}
                  onChange={(e) => setSetupEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="setup-pw" className="block text-xs font-medium text-slate-300">
                  Create Private Admin Password (minimum 10 characters)
                </label>
                <input
                  id="setup-pw"
                  type="password"
                  required
                  minLength={10}
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="setup-pw2" className="block text-xs font-medium text-slate-300">
                  Confirm Admin Password
                </label>
                <input
                  id="setup-pw2"
                  type="password"
                  required
                  minLength={10}
                  value={setupConfirm}
                  onChange={(e) => setSetupConfirm(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={setupBusy}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-sm font-medium text-white cursor-pointer"
              >
                {setupBusy
                  ? 'Hashing Password & Generating TOTP...'
                  : 'Continue to Mandatory 2FA Setup'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const lockoutRemainingMs =
    status?.lockoutRemainingMs ?? publicStatus?.lockoutRemainingMs ?? 0;

  // Standard Admin Authentication Gateway (Email + Password -> Mandatory 6-Digit TOTP -> Gmail Identity Session)
  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/35 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold text-white">
                Admin Control Sign In
              </h1>
              <p className="text-xs text-slate-400">
                Authorized administrator &amp; mandatory 2FA required
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-indigo-300">Step {step} / 3</span>
        </div>

        {/* 3-Step Progress Bar */}
        <div className="grid grid-cols-3 gap-2 text-[11px] font-medium">
          {[
            { num: 1, label: '1. Email & Password' },
            { num: 2, label: '2. 6-Digit 2FA' },
            { num: 3, label: '3. Gmail Session' },
          ].map((item) => (
            <div
              key={item.num}
              className={`py-2 px-2.5 rounded-xl border text-center ${
                step === item.num
                  ? 'bg-indigo-600/20 border-indigo-500 text-white'
                  : step > item.num
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-[#060913] border-white/[0.06] text-slate-500'
              }`}
            >
              {item.label}
            </div>
          ))}
        </div>

        {lockoutRemainingMs > 0 && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Temporary login lockout is active ({Math.ceil(lockoutRemainingMs / 60000)}m remaining) due to repeated failed attempts.
            </span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* STEP 1: EMAIL & PASSWORD LOGIN FORM */}
        {step === 1 && (
          <form onSubmit={handleStep1} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="admin-login-email" className="block text-xs font-medium text-slate-300">
                Authorized Administrator Gmail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-login-email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="Enter authorized Gmail address"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-login-pw" className="block text-xs font-medium text-slate-300">
                Administrator Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-login-pw"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter administrator password"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy || !emailInput || !passwordInput}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium text-white flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{busy ? 'Verifying Credentials...' : 'Sign In & Continue to 2FA'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* STEP 2: MANDATORY 6-DIGIT TOTP AUTHENTICATOR */}
        {step === 2 && challenge && (
          <form onSubmit={handleStep2} className="space-y-4">
            {challenge.needsTotpEnrollment ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 leading-relaxed">
                  Mandatory 6-digit authenticator 2FA must be bound to your administrator account before entering the dashboard.
                </div>

                {!legacyEnrollData ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleBeginLegacyEnroll()}
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white cursor-pointer"
                  >
                    {busy ? 'Generating Authenticator Key...' : 'Generate Authenticator QR Code'}
                  </button>
                ) : (
                  <div className="rounded-xl bg-[#060913] border border-white/[0.08] p-4 flex flex-col sm:flex-row items-center gap-4">
                    <div className="p-2 rounded-lg bg-white shrink-0">
                      <QRCodeSVG value={legacyEnrollData.otpauthUri} size={120} />
                    </div>
                    <div className="text-xs space-y-1.5">
                      <p className="text-white font-medium">Scan with Google Authenticator / Authy</p>
                      <p className="font-mono text-indigo-300 break-all">{legacyEnrollData.secret}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-[#060913] border border-white/[0.08] p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                  <Smartphone className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-xs space-y-1">
                  <p className="font-medium text-white">
                    Authenticator Verification Required
                  </p>
                  <p className="text-slate-400 leading-relaxed">
                    Open Google Authenticator, Authy, or your TOTP app and enter the current 6-digit verification code.
                  </p>
                </div>
              </div>
            )}

            {(!challenge.needsTotpEnrollment || legacyEnrollData) && (
              <div className="space-y-1.5">
                <label htmlFor="admin-totp-step2" className="block text-xs font-medium text-slate-300">
                  6-Digit Authenticator Code
                </label>
                <input
                  id="admin-totp-step2"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  required
                  maxLength={6}
                  autoFocus
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full px-3.5 py-3 rounded-xl bg-[#060913] border border-white/10 text-lg font-mono tracking-[0.4em] text-center text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            <div className="flex items-center gap-3">
              {(!challenge.needsTotpEnrollment || legacyEnrollData) && (
                <button
                  type="submit"
                  disabled={busy || totpCode.length !== 6}
                  className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium text-white flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>{busy ? 'Verifying Code...' : 'Verify 6-Digit Code'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setChallenge(null);
                  setTotpCode('');
                  setLegacyEnrollData(null);
                  setErrorMsg(null);
                }}
                className="min-h-[46px] px-4 py-2.5 rounded-xl border border-white/10 text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                Back
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: AUTHORIZED GMAIL SESSION VERIFICATION */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="rounded-xl bg-[#060913] border border-white/[0.08] p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-emerald-400">
                <span>Step 1 · Authorized Email &amp; Password</span>
                <span className="flex items-center gap-1 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                </span>
              </div>
              <div className="flex items-center justify-between text-emerald-400">
                <span>Step 2 · Mandatory 6-Digit TOTP 2FA</span>
                <span className="flex items-center gap-1 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                </span>
              </div>
              <div className="flex items-center justify-between text-indigo-300 pt-1 border-t border-white/[0.06]">
                <span>Step 3 · Authorized Google Session</span>
                <span className="font-mono">
                  {firebaseUser && isAdmin ? firebaseUser.email : 'Required'}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleStep3()}
              className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-sm font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>
                {busy
                  ? 'Authorizing Admin Session...'
                  : firebaseUser && isAdmin
                  ? 'Open Admin Control Center'
                  : 'Verify Authorized Gmail via Google & Enter'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
