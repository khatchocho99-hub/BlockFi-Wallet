import { auth } from '../lib/firebase';
import type { MarketCoin } from '../types/exchange';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required');
  }
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchMarkets(): Promise<{ coins: MarketCoin[]; updatedAtMs: number }> {
  const res = await fetch('/api/markets');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load market data');
  }
  return res.json();
}

export async function fetchCoinOhlc(
  coinId: string,
  days: string
): Promise<[number, number, number, number, number][]> {
  const res = await fetch(
    `/api/markets/${encodeURIComponent(coinId)}/ohlc?days=${encodeURIComponent(days)}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load candlestick chart');
  }
  const json = (await res.json()) as { candles: [number, number, number, number, number][] };
  return json.candles;
}

export async function fetchServerTimeMs(): Promise<number> {
  const res = await fetch('/api/server-time');
  if (!res.ok) return Date.now();
  const json = (await res.json()) as { serverTimeMs: number };
  return json.serverTimeMs;
}

export async function placeServerFuturesOrder(payload: {
  coinId: string;
  symbol: string;
  coinName: string;
  direction: 'LONG' | 'SHORT';
  amount: number;
  durationSeconds: number;
}): Promise<{
  tradeId: string;
  entryPrice: number;
  profitRate: number;
  startedAtMs: number;
  lockAtMs: number;
  expiresAtMs: number;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/futures/place', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to place futures contract');
  }
  return json;
}

export async function settleServerFuturesOrder(tradeId: string): Promise<{
  tradeId: string;
  settled: boolean;
  alreadySettled: boolean;
  result: 'WIN' | 'LOSE';
  exitPrice: number;
  payout: number;
  netPnl: number;
  settledAtMs: number;
  settlementSignature: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/futures/${encodeURIComponent(tradeId)}/settle`, {
    method: 'POST',
    headers,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to settle futures contract');
  }
  return json;
}

// --- Private Admin Control Center API (/api/secure-control/*) ---

export interface SecureControlStatus {
  initialized: boolean;
  isOwner: boolean;
  sessionValid: boolean;
  sessionExpiresAtMs: number | null;
  sessionTtlMinutes: number;
  totpEnabled: boolean;
  lockoutRemainingMs: number;
  cardId: string | null;
  activeSessionsCount: number;
}

export interface SecurityLogEntry {
  id: string;
  timestampMs: number;
  event: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  email: string;
  ip: string;
  userAgent: string;
  details: string;
}

export interface ServerRoundView {
  tradeId: string;
  uid: string;
  userEmail: string;
  coinId: string;
  symbol: string;
  coinName: string;
  direction: 'LONG' | 'SHORT';
  amount: number;
  entryPrice: number;
  durationSeconds: number;
  startedAtMs: number;
  lockAtMs: number;
  expiresAtMs: number;
  configuredOutcome: 'AUTO' | 'WIN' | 'LOSE';
  locked: boolean;
  isLocked: boolean;
  settled: boolean;
  serverTimeMs: number;
}

export interface SecureControlPublicStatus {
  initialized: boolean;
  totpConfigured: boolean;
  lockoutRemainingMs: number;
}

export async function fetchSecureControlPublicStatus(): Promise<SecureControlPublicStatus> {
  const res = await fetch('/api/secure-control/public-status', {
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to check security status');
  }
  return json;
}

export async function fetchSecureControlStatus(): Promise<SecureControlStatus> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/secure-control/status', {
    headers,
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Unauthorized');
  }
  return json;
}

export async function beginOwnerVaultSetupApi(payload: {
  email: string;
  password: string;
  confirmPassword: string;
}): Promise<{ setupId: string; totpSecret: string; otpauthUri: string; expiresAtMs: number }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/secure-control/setup/begin', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Owner setup failed');
  }
  return json;
}

export async function completeOwnerVaultSetupApi(payload: {
  setupId: string;
  totpCode: string;
}): Promise<{ initialized: boolean; cardId: string; plainGrid: Record<string, string> }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/secure-control/setup/complete', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Authenticator verification failed');
  }
  return json;
}

export async function submitAdminStep1Login(payload: {
  email: string;
  password: string;
}): Promise<{
  challengeId: string;
  totpRequired: true;
  needsTotpEnrollment: boolean;
  expiresAtMs: number;
}> {
  const res = await fetch('/api/secure-control/auth/step1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Email or password verification failed');
  }
  return json;
}

export async function submitAdminStep2Totp(payload: {
  challengeId: string;
  totpCode: string;
}): Promise<{ readyForStep3: boolean; verificationNonce: string }> {
  const res = await fetch('/api/secure-control/auth/step2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || '6-digit authenticator verification failed');
  }
  return json;
}

export async function enrollLegacyTotpApi(payload: {
  action: 'BEGIN' | 'COMPLETE';
  challengeId: string;
  totpCode?: string;
}): Promise<{
  secret?: string;
  otpauthUri?: string;
  readyForStep3?: boolean;
  verificationNonce?: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/secure-control/auth/enroll-totp', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'TOTP enrollment failed');
  }
  return json;
}

export async function submitAdminStep3Verify(payload: {
  challengeId: string;
  verificationNonce: string;
}): Promise<{ authenticated: boolean; expiresAtMs: number }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/secure-control/auth/step3', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Access verification failed');
  }
  return json;
}

export async function logoutSecureControl(): Promise<void> {
  const headers = await getAuthHeaders().catch(() => ({ 'Content-Type': 'application/json' }));
  await fetch('/api/secure-control/logout', {
    method: 'POST',
    headers,
    credentials: 'include',
  });
}

export async function fetchSecurityLogs(): Promise<SecurityLogEntry[]> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/secure-control/security-logs', {
    headers,
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to load security logs');
  }
  return json.logs;
}

export async function recordAdminSecurityAudit(
  event: string,
  details: string,
  severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO'
): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    await fetch('/api/secure-control/audit', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ event, details, severity }),
    });
  } catch {
    // Non-blocking secondary audit mirror
  }
}

export async function ownerUpdatePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/secure-control/settings/password', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update password');
}

export async function ownerRotateCard(
  currentPassword: string
): Promise<{ cardId: string; plainGrid: Record<string, string> }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/secure-control/settings/rotate-card', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ currentPassword }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to rotate security card');
  return json;
}

export async function ownerConfigureTotpApi(payload: {
  action: 'BEGIN' | 'CONFIRM';
  secret?: string;
  code?: string;
  currentPassword?: string;
}): Promise<{ totpEnabled: boolean; secret?: string; otpauthUri?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/secure-control/settings/totp', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to rotate authenticator key');
  return json;
}

export async function ownerUpdateSessionTtlApi(ttlMinutes: number): Promise<number> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/secure-control/settings/session-ttl', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ ttlMinutes }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update session timeout');
  return json.sessionTtlMinutes;
}

export async function ownerRevokeAllSessionsApi(): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/secure-control/settings/revoke-all', {
    method: 'POST',
    headers,
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to revoke sessions');
}

export async function fetchAdminServerRounds(): Promise<{
  rounds: ServerRoundView[];
  serverTimeMs: number;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/secure-control/futures/rounds', {
    headers,
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to load server futures rounds');
  }
  return json;
}

export async function configureAdminTradeOutcome(
  tradeId: string,
  outcome: 'AUTO' | 'WIN' | 'LOSE',
  lock: boolean
): Promise<{
  tradeId: string;
  configuredOutcome: 'AUTO' | 'WIN' | 'LOSE';
  locked: boolean;
  lockAtMs: number;
  serverTimeMs: number;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/secure-control/futures/${encodeURIComponent(tradeId)}/outcome`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ outcome, lock }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to update round outcome');
  }
  return json;
}
