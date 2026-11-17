import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import {
  appendSecurityLog,
  beginLegacyTotpEnrollment,
  beginOwnerVaultSetup,
  checkRateLimit,
  completeLegacyTotpEnrollment,
  completeOwnerVaultSetup,
  completeStep3Session,
  getActiveSessionsCount,
  getLockoutRemainingMs,
  getValidAdminSession,
  ownerChangePassword,
  ownerRotateMandatoryTotp,
  ownerRotateSecurityCard,
  ownerUpdateSessionTtl,
  parseCookie,
  readSecurityLogs,
  readVault,
  revokeAdminSession,
  revokeAllAdminSessions,
  verifyStep1EmailPassword,
  verifyStep2Totp,
} from './server-admin-security.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId: string;
}

const firebaseConfigPath = path.join(__dirname, 'firebase-applet-config.json');
const firebaseConfig: FirebaseAppletConfig = JSON.parse(
  fs.readFileSync(firebaseConfigPath, 'utf-8')
);

const PORT = Number(process.env.PORT) || 3000;
const AUTHORIZED_ADMIN_EMAIL = (
  process.env.ADMIN_AUTHORIZED_EMAIL || 'khatchocho99@gmail.com'
)
  .trim()
  .toLowerCase();
const VALID_DURATIONS = new Set([30, 60, 180, 300, 900, 3600, 21600, 43200, 86400]);
const PROFIT_RATE = 0.3;
const SERVER_HMAC_KEY =
  process.env.FUTURES_ENGINE_SECRET || crypto.randomBytes(32).toString('hex');

interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  high_24h: number;
  low_24h: number;
  sparkline_in_7d?: { price: number[] };
}

interface ActiveRound {
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
  settled: boolean;
  settlement?: {
    result: 'WIN' | 'LOSE';
    exitPrice: number;
    payout: number;
    netPnl: number;
    settledAtMs: number;
    settlementSignature: string;
  };
}

// In-memory authoritative server caches & round registry
let marketsCache: { data: MarketCoin[]; fetchedAt: number } | null = null;
const ohlcCache = new Map<string, { data: [number, number, number, number, number][]; fetchedAt: number }>();
const activeRounds = new Map<string, ActiveRound>();

const FEATURED_IDS = [
  'bitcoin',
  'ethereum',
  'solana',
  'cardano',
  'ripple',
  'binancecoin',
  'dogecoin',
  'tron',
  'avalanche-2',
  'polkadot',
  'chainlink',
  'litecoin',
  'the-open-network',
  'sui',
  'uniswap',
  'near',
  'stellar',
  'cosmos',
  'arbitrum',
  'aptos',
];

async function fetchCoinGeckoMarkets(): Promise<MarketCoin[]> {
  const now = Date.now();
  if (marketsCache && now - marketsCache.fetchedAt < 30_000) {
    return marketsCache.data;
  }

  const url =
    `https://api.coingecko.com/api/v3/coins/markets` +
    `?vs_currency=usd&ids=${FEATURED_IDS.join(',')}` +
    `&order=market_cap_desc&per_page=30&page=1&sparkline=true&price_change_percentage=24h`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'VeltrixExchange/1.0',
    },
  });

  if (!response.ok) {
    if (marketsCache) {
      return marketsCache.data;
    }
    throw new Error(`CoinGecko market request failed with status ${response.status}`);
  }

  const data = (await response.json()) as MarketCoin[];
  marketsCache = { data, fetchedAt: now };
  return data;
}

async function fetchCoinGeckoOhlc(
  coinId: string,
  days: string
): Promise<[number, number, number, number, number][]> {
  const safeCoinId = coinId.replace(/[^a-zA-Z0-9-]/g, '');
  const safeDays = ['1', '7', '14', '30', '90'].includes(days) ? days : '1';
  const cacheKey = `${safeCoinId}:${safeDays}`;
  const now = Date.now();

  const cached = ohlcCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < 60_000) {
    return cached.data;
  }

  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
    safeCoinId
  )}/ohlc?vs_currency=usd&days=${safeDays}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'VeltrixExchange/1.0',
    },
  });

  if (!response.ok) {
    if (cached) {
      return cached.data;
    }
    throw new Error(`CoinGecko OHLC request failed with status ${response.status}`);
  }

  const data = (await response.json()) as [number, number, number, number, number][];
  ohlcCache.set(cacheKey, { data, fetchedAt: now });
  return data;
}

async function getLiveCoinPrice(coinId: string): Promise<number> {
  const markets = await fetchCoinGeckoMarkets();
  const found = markets.find((m) => m.id === coinId);
  if (found && typeof found.current_price === 'number' && found.current_price > 0) {
    return found.current_price;
  }

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    coinId
  )}&vs_currencies=usd`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'VeltrixExchange/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Unable to fetch live price for ${coinId}`);
  }
  const json = (await res.json()) as Record<string, { usd?: number }>;
  const price = json[coinId]?.usd;
  if (!price || price <= 0) {
    throw new Error(`Invalid price returned for ${coinId}`);
  }
  return price;
}

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  idToken: string;
}

async function verifyFirebaseUser(authHeader: string | undefined): Promise<VerifiedFirebaseUser> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing Authorization Bearer token');
  }
  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    throw new Error('Empty Firebase ID token');
  }

  const lookupRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!lookupRes.ok) {
    throw new Error('Invalid or expired Firebase session token');
  }

  const payload = (await lookupRes.json()) as {
    users?: Array<{ localId: string; email?: string; emailVerified?: boolean }>;
  };

  const user = payload.users?.[0];
  if (!user || !user.localId || !user.email) {
    throw new Error('Authenticated user record incomplete');
  }
  if (!user.emailVerified || !user.email.toLowerCase().endsWith('@gmail.com')) {
    throw new Error('Only verified @gmail.com Google accounts are permitted');
  }

  return {
    uid: user.localId,
    email: user.email.toLowerCase(),
    emailVerified: Boolean(user.emailVerified),
    idToken,
  };
}

async function isAuthorizedAdmin(user: VerifiedFirebaseUser): Promise<boolean> {
  return user.emailVerified === true && user.email === AUTHORIZED_ADMIN_EMAIL;
}

async function fetchUserKycApprovedFromFirestore(user: VerifiedFirebaseUser): Promise<{
  approved: boolean;
  availableBalance: number;
}> {
  const docUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/users/${user.uid}`;
  const res = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${user.idToken}` },
  });
  if (!res.ok) {
    throw new Error('User profile not found in Firestore');
  }
  const doc = (await res.json()) as {
    fields?: {
      kycStatus?: { stringValue?: string };
      availableBalance?: { doubleValue?: number; integerValue?: string };
    };
  };
  const kycStatus = doc.fields?.kycStatus?.stringValue || 'NOT_SUBMITTED';
  const rawBal = doc.fields?.availableBalance;
  const availableBalance =
    typeof rawBal?.doubleValue === 'number'
      ? rawBal.doubleValue
      : rawBal?.integerValue
      ? Number(rawBal.integerValue)
      : 0;

  return {
    approved: kycStatus === 'APPROVED',
    availableBalance,
  };
}

async function hydrateRoundFromFirestore(
  tradeId: string,
  idToken: string
): Promise<ActiveRound | null> {
  const tradeUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/trades/${tradeId}`;
  const res = await fetch(tradeUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) {
    return null;
  }
  const doc = (await res.json()) as { fields?: Record<string, { stringValue?: string; doubleValue?: number; integerValue?: string }> };
  const f = doc.fields;
  if (!f) return null;

  const num = (key: string): number => {
    const field = f[key];
    if (!field) return 0;
    if (typeof field.doubleValue === 'number') return field.doubleValue;
    if (field.integerValue) return Number(field.integerValue);
    return 0;
  };
  const str = (key: string): string => f[key]?.stringValue || '';

  const round: ActiveRound = {
    tradeId,
    uid: str('uid'),
    userEmail: str('userEmail'),
    coinId: str('coinId'),
    symbol: str('symbol'),
    coinName: str('coinName'),
    direction: str('direction') === 'SHORT' ? 'SHORT' : 'LONG',
    amount: num('amount'),
    entryPrice: num('entryPrice'),
    durationSeconds: num('durationSeconds'),
    startedAtMs: num('startedAtMs'),
    lockAtMs: num('lockAtMs'),
    expiresAtMs: num('expiresAtMs'),
    configuredOutcome: 'AUTO',
    locked: Date.now() >= num('lockAtMs'),
    settled: str('status') === 'SETTLED',
  };

  if (round.settled) {
    round.settlement = {
      result: str('result') === 'WIN' ? 'WIN' : 'LOSE',
      exitPrice: num('exitPrice'),
      payout: num('payout'),
      netPnl: num('netPnl'),
      settledAtMs: Date.now(),
      settlementSignature: str('settlementSignature'),
    };
  }

  activeRounds.set(tradeId, round);
  return round;
}

function signSettlement(
  tradeId: string,
  uid: string,
  result: 'WIN' | 'LOSE',
  payout: number,
  expiresAtMs: number
): string {
  return crypto
    .createHmac('sha256', SERVER_HMAC_KEY)
    .update(`${tradeId}:${uid}:${result}:${payout.toFixed(2)}:${expiresAtMs}`)
    .digest('hex');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/server-time', (_req, res) => {
    res.json({ serverTimeMs: Date.now() });
  });

  app.get('/api/markets', async (_req, res) => {
    try {
      const markets = await fetchCoinGeckoMarkets();
      res.json({ coins: markets, updatedAtMs: Date.now() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch markets';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/markets/:coinId/ohlc', async (req, res) => {
    try {
      const { coinId } = req.params;
      const days = typeof req.query.days === 'string' ? req.query.days : '1';
      const candles = await fetchCoinGeckoOhlc(coinId, days);
      res.json({ coinId, days, candles });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch OHLC data';
      res.status(502).json({ error: message });
    }
  });

  // Place simulated futures contract (server-controlled timestamps & entry price)
  app.post('/api/futures/place', async (req, res) => {
    try {
      const user = await verifyFirebaseUser(req.headers.authorization);
      const { coinId, symbol, coinName, direction, amount, durationSeconds } = req.body as {
        coinId?: string;
        symbol?: string;
        coinName?: string;
        direction?: string;
        amount?: number;
        durationSeconds?: number;
      };

      if (
        !coinId ||
        typeof coinId !== 'string' ||
        !symbol ||
        typeof symbol !== 'string' ||
        !coinName ||
        typeof coinName !== 'string'
      ) {
        res.status(400).json({ error: 'Invalid cryptocurrency selection' });
        return;
      }

      if (direction !== 'LONG' && direction !== 'SHORT') {
        res.status(400).json({ error: 'Direction must be LONG or SHORT' });
        return;
      }

      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount < 1 || numericAmount > 1_000_000) {
        res.status(400).json({ error: 'Amount must be between $1 and $1,000,000' });
        return;
      }

      const dur = Number(durationSeconds);
      if (!VALID_DURATIONS.has(dur)) {
        res.status(400).json({ error: 'Unsupported contract duration' });
        return;
      }

      const accountState = await fetchUserKycApprovedFromFirestore(user);
      if (!accountState.approved) {
        res.status(403).json({
          error: 'KYC verification must be approved before accessing demo futures trading.',
        });
        return;
      }
      if (accountState.availableBalance < numericAmount) {
        res.status(400).json({ error: 'Insufficient available demo balance' });
        return;
      }

      const entryPrice = await getLiveCoinPrice(coinId);
      const startedAtMs = Date.now();
      const durationMs = dur * 1000;
      const lockLeadMs = dur === 30 ? 10_000 : Math.min(30_000, Math.floor(durationMs * 0.25));
      const lockAtMs = startedAtMs + Math.max(5_000, durationMs - lockLeadMs);
      const expiresAtMs = startedAtMs + durationMs;
      const tradeId = `trd_${crypto.randomBytes(8).toString('hex')}`;

      const round: ActiveRound = {
        tradeId,
        uid: user.uid,
        userEmail: user.email,
        coinId,
        symbol: symbol.toUpperCase(),
        coinName,
        direction,
        amount: Number(numericAmount.toFixed(2)),
        entryPrice,
        durationSeconds: dur,
        startedAtMs,
        lockAtMs,
        expiresAtMs,
        configuredOutcome: 'AUTO',
        locked: false,
        settled: false,
      };

      activeRounds.set(tradeId, round);

      res.json({
        tradeId: round.tradeId,
        entryPrice: round.entryPrice,
        profitRate: PROFIT_RATE,
        startedAtMs: round.startedAtMs,
        lockAtMs: round.lockAtMs,
        expiresAtMs: round.expiresAtMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to place futures contract';
      res.status(401).json({ error: message });
    }
  });

  // Settle simulated futures contract (only allowed once expiresAtMs has elapsed)
  app.post('/api/futures/:tradeId/settle', async (req, res) => {
    try {
      const user = await verifyFirebaseUser(req.headers.authorization);
      const { tradeId } = req.params;

      let round = activeRounds.get(tradeId);
      if (!round) {
        const hydrated = await hydrateRoundFromFirestore(tradeId, user.idToken);
        if (!hydrated) {
          res.status(404).json({ error: 'Trade round not found' });
          return;
        }
        round = hydrated;
      }

      if (round.uid !== user.uid) {
        const admin = await isAuthorizedAdmin(user);
        if (!admin) {
          res.status(403).json({ error: 'Unauthorized trade access' });
          return;
        }
      }

      if (round.settled && round.settlement) {
        res.json({
          tradeId: round.tradeId,
          settled: true,
          alreadySettled: true,
          ...round.settlement,
        });
        return;
      }

      const now = Date.now();
      if (now < round.expiresAtMs) {
        res.status(400).json({
          error: 'Round countdown has not expired yet. Outcomes cannot be revealed early.',
          remainingMs: round.expiresAtMs - now,
        });
        return;
      }

      // Lock round upon expiry
      round.locked = true;

      // Check Firestore adminTradeConfigs if admin configured via Firestore or server
      let finalOutcome = round.configuredOutcome;
      if (finalOutcome === 'AUTO') {
        try {
          const cfgUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/adminTradeConfigs/${tradeId}`;
          const cfgRes = await fetch(cfgUrl, {
            headers: { Authorization: `Bearer ${user.idToken}` },
          });
          if (cfgRes.ok) {
            const cfgDoc = (await cfgRes.json()) as {
              fields?: { configuredOutcome?: { stringValue?: string } };
            };
            const val = cfgDoc.fields?.configuredOutcome?.stringValue;
            if (val === 'WIN' || val === 'LOSE') {
              finalOutcome = val;
            }
          }
        } catch {
          // Customer cannot read adminTradeConfigs (expected when customer triggers settle);
          // server memory holds any admin-configured outcome!
        }
      }

      const exitPrice = await getLiveCoinPrice(round.coinId);
      let result: 'WIN' | 'LOSE';
      if (finalOutcome === 'WIN') {
        result = 'WIN';
      } else if (finalOutcome === 'LOSE') {
        result = 'LOSE';
      } else {
        if (round.direction === 'LONG') {
          result = exitPrice > round.entryPrice ? 'WIN' : 'LOSE';
        } else {
          result = exitPrice < round.entryPrice ? 'WIN' : 'LOSE';
        }
      }

      const payout =
        result === 'WIN' ? Number((round.amount * (1 + PROFIT_RATE)).toFixed(2)) : 0;
      const netPnl =
        result === 'WIN'
          ? Number((round.amount * PROFIT_RATE).toFixed(2))
          : -Number(round.amount.toFixed(2));

      const settlementSignature = signSettlement(
        round.tradeId,
        round.uid,
        result,
        payout,
        round.expiresAtMs
      );

      round.settled = true;
      round.settlement = {
        result,
        exitPrice,
        payout,
        netPnl,
        settledAtMs: now,
        settlementSignature,
      };

      res.json({
        tradeId: round.tradeId,
        settled: true,
        alreadySettled: false,
        ...round.settlement,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to settle trade';
      res.status(400).json({ error: message });
    }
  });

  const ADMIN_COOKIE_NAME = 'vtx_admin_session';

  function getClientIp(req: express.Request): string {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length > 0) {
      return fwd.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }

  function buildAdminCookie(req: express.Request, value: string, maxAgeSec: number): string {
    const isHttps =
      req.secure || req.headers['x-forwarded-proto'] === 'https';
    const base = `${ADMIN_COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${maxAgeSec}`;
    return isHttps ? `${base}; SameSite=None; Secure` : `${base}; SameSite=Lax`;
  }

  async function verifyAdminIdentity(req: express.Request): Promise<VerifiedFirebaseUser> {
    const user = await verifyFirebaseUser(req.headers.authorization);
    const admin = await isAuthorizedAdmin(user);
    if (!admin) {
      appendSecurityLog({
        event: 'UNAUTHORIZED_ADMIN_ACCESS_BLOCKED',
        severity: 'CRITICAL',
        email: user.email,
        ip: getClientIp(req),
        userAgent: String(req.headers['user-agent'] || 'unknown'),
        details: `Non-admin account ${user.email} attempted to access ${req.path}.`,
      });
      throw new Error('FORBIDDEN: Unauthorized access blocked.');
    }
    return user;
  }

  async function requireAdminSession(req: express.Request): Promise<{
    user: VerifiedFirebaseUser;
    sessionExpiresAtMs: number;
  }> {
    const user = await verifyAdminIdentity(req);
    const cookieSid = parseCookie(req.headers.cookie, ADMIN_COOKIE_NAME);
    const session = getValidAdminSession(cookieSid, user.uid, user.email, AUTHORIZED_ADMIN_EMAIL);
    if (!session) {
      throw new Error('SESSION_REQUIRED: Valid multi-factor administrator session required.');
    }
    return { user, sessionExpiresAtMs: session.expiresAtMs };
  }

  // Non-sensitive initialization status check for /secure-control entry
  app.get('/api/secure-control/public-status', (req, res) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Rate limit exceeded. Wait 60 seconds.' });
      return;
    }
    const vault = readVault();
    res.json({
      initialized: Boolean(vault),
      totpConfigured: Boolean(vault?.totpEnabled && vault?.totpSecret),
      lockoutRemainingMs: vault ? getLockoutRemainingMs(vault) : 0,
    });
  });

  // Check /secure-control initialization and authenticated session status
  app.get('/api/secure-control/status', async (req, res) => {
    try {
      const user = await verifyAdminIdentity(req);
      const vault = readVault();
      const cookieSid = parseCookie(req.headers.cookie, ADMIN_COOKIE_NAME);
      const session = getValidAdminSession(cookieSid, user.uid, user.email, AUTHORIZED_ADMIN_EMAIL);
      res.json({
        initialized: Boolean(vault),
        isOwner: user.email === AUTHORIZED_ADMIN_EMAIL,
        sessionValid: Boolean(session),
        sessionExpiresAtMs: session ? session.expiresAtMs : null,
        sessionTtlMinutes: vault?.sessionTtlMinutes ?? 30,
        totpEnabled: Boolean(vault?.totpEnabled),
        lockoutRemainingMs: vault ? getLockoutRemainingMs(vault) : 0,
        cardId: vault?.cardId || null,
        activeSessionsCount: session ? getActiveSessionsCount() : 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unauthorized';
      const status = message.startsWith('FORBIDDEN') ? 403 : 401;
      res.status(status).json({ error: message });
    }
  });

  // One-time Owner Vault Initialization: Step A (Email + Password -> Mandatory TOTP QR)
  app.post('/api/secure-control/setup/begin', async (req, res) => {
    const ip = getClientIp(req);
    const ua = String(req.headers['user-agent'] || 'unknown');
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Rate limit exceeded. Wait 60 seconds.' });
      return;
    }
    try {
      const user = await verifyAdminIdentity(req);
      if (user.email !== AUTHORIZED_ADMIN_EMAIL) {
        appendSecurityLog({
          event: 'NON_OWNER_SETUP_BLOCKED',
          severity: 'CRITICAL',
          email: user.email,
          ip,
          userAgent: ua,
          details: 'Unauthorized user attempted to initialize administrator credentials.',
        });
        res.status(403).json({
          error: 'Only the authorized owner Gmail account can initialize administrator credentials.',
        });
        return;
      }
      if (readVault()) {
        res.status(403).json({ error: 'Public or duplicate admin registration is disabled.' });
        return;
      }

      const { email, password, confirmPassword } = req.body as {
        email?: string;
        password?: string;
        confirmPassword?: string;
      };
      if (!email || email.trim().toLowerCase() !== AUTHORIZED_ADMIN_EMAIL) {
        res.status(403).json({
          error: 'Entered email does not match the authorized administrator Gmail account.',
        });
        return;
      }
      if (!password || password.length < 10) {
        res.status(400).json({ error: 'Admin password must be at least 10 characters.' });
        return;
      }
      if (password !== confirmPassword) {
        res.status(400).json({ error: 'Password confirmation does not match.' });
        return;
      }

      const started = beginOwnerVaultSetup({
        uid: user.uid,
        ownerEmail: user.email,
        password,
        ip,
        userAgent: ua,
      });

      res.json(started);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Setup failed';
      const status = message.startsWith('FORBIDDEN')
        ? 403
        : message.includes('token') || message.includes('Bearer') || message.includes('gmail')
        ? 401
        : 400;
      res.status(status).json({ error: message });
    }
  });

  // One-time Owner Vault Initialization: Step B (Verify Mandatory 6-Digit TOTP Code)
  app.post('/api/secure-control/setup/complete', async (req, res) => {
    const ip = getClientIp(req);
    const ua = String(req.headers['user-agent'] || 'unknown');
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Rate limit exceeded. Wait 60 seconds.' });
      return;
    }
    try {
      const user = await verifyAdminIdentity(req);
      if (user.email !== AUTHORIZED_ADMIN_EMAIL) {
        res.status(403).json({ error: 'Owner permission required.' });
        return;
      }
      if (readVault()) {
        res.status(403).json({ error: 'Public or duplicate admin registration is disabled.' });
        return;
      }

      const { setupId, totpCode } = req.body as {
        setupId?: string;
        totpCode?: string;
      };
      if (!setupId || !totpCode) {
        res.status(400).json({ error: 'Setup ID and 6-digit authenticator code are required.' });
        return;
      }

      const created = completeOwnerVaultSetup({
        uid: user.uid,
        setupId,
        totpCode,
        ip,
        userAgent: ua,
      });

      res.json({
        initialized: true,
        cardId: created.cardId,
        plainGrid: created.plainGrid,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Setup verification failed';
      const status = message.startsWith('FORBIDDEN')
        ? 403
        : message.includes('token') || message.includes('Bearer') || message.includes('gmail')
        ? 401
        : 400;
      res.status(status).json({ error: message });
    }
  });

  // Legacy /setup route permanently disabled for safety
  app.post('/api/secure-control/setup', (_req, res) => {
    res.status(403).json({ error: 'Public administrator registration is disabled.' });
  });

  // Step 1: Email & Password Login Verification (Server-Side)
  app.post('/api/secure-control/auth/step1', (req, res) => {
    const ip = getClientIp(req);
    const ua = String(req.headers['user-agent'] || 'unknown');
    if (!checkRateLimit(ip)) {
      appendSecurityLog({
        event: 'RATE_LIMIT_EXCEEDED',
        severity: 'WARNING',
        email: String((req.body as { email?: string })?.email || 'unknown'),
        ip,
        userAgent: ua,
        details: 'Step 1 admin login rate limit exceeded.',
      });
      res.status(429).json({ error: 'Rate limit exceeded. Wait 60 seconds before retrying.' });
      return;
    }
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
        res.status(400).json({ error: 'Administrator Gmail and password are required.' });
        return;
      }
      const challenge = verifyStep1EmailPassword({
        email,
        password,
        authorizedEmail: AUTHORIZED_ADMIN_EMAIL,
        ip,
        userAgent: ua,
      });
      res.json(challenge);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      if (message.startsWith('LOCKED:')) {
        const secs = Number(message.split(':')[1] || 900);
        res.status(429).json({
          error: `Temporary login lockout active. Try again in ${Math.ceil(secs / 60)} minute(s).`,
          lockoutSeconds: secs,
        });
        return;
      }
      res.status(401).json({ error: message });
    }
  });

  // Step 2: Mandatory 6-Digit Authenticator (TOTP) Verification
  app.post('/api/secure-control/auth/step2', (req, res) => {
    const ip = getClientIp(req);
    const ua = String(req.headers['user-agent'] || 'unknown');
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Rate limit exceeded. Wait 60 seconds.' });
      return;
    }
    try {
      const { challengeId, totpCode } = req.body as {
        challengeId?: string;
        totpCode?: string;
      };
      if (!challengeId || !totpCode) {
        res.status(400).json({ error: '6-digit authenticator verification code is required.' });
        return;
      }
      const result = verifyStep2Totp({
        challengeId,
        totpCode,
        ip,
        userAgent: ua,
      });
      res.json({ readyForStep3: true, verificationNonce: result.verificationNonce });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authenticator verification failed';
      if (message.startsWith('LOCKED:')) {
        const secs = Number(message.split(':')[1] || 900);
        res.status(429).json({
          error: `Temporary login lockout active. Try again in ${Math.ceil(secs / 60)} minute(s).`,
          lockoutSeconds: secs,
        });
        return;
      }
      res.status(401).json({ error: message });
    }
  });

  // Upgrade path if a previously created vault did not have TOTP enrolled yet
  app.post('/api/secure-control/auth/enroll-totp', async (req, res) => {
    const ip = getClientIp(req);
    const ua = String(req.headers['user-agent'] || 'unknown');
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Rate limit exceeded. Wait 60 seconds.' });
      return;
    }
    try {
      const user = await verifyAdminIdentity(req);
      const { action, challengeId, totpCode } = req.body as {
        action?: 'BEGIN' | 'COMPLETE';
        challengeId?: string;
        totpCode?: string;
      };
      if (!challengeId) {
        res.status(400).json({ error: 'Missing authentication challenge ID.' });
        return;
      }
      if (action === 'BEGIN') {
        res.json(
          beginLegacyTotpEnrollment({
            challengeId,
            uid: user.uid,
            email: user.email,
          })
        );
        return;
      }
      if (action === 'COMPLETE' && totpCode) {
        const result = completeLegacyTotpEnrollment({
          challengeId,
          uid: user.uid,
          email: user.email,
          totpCode,
          ip,
          userAgent: ua,
        });
        res.json({ readyForStep3: true, verificationNonce: result.verificationNonce });
        return;
      }
      res.status(400).json({ error: 'Invalid enrollment request.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Enrollment failed';
      res.status(message.startsWith('FORBIDDEN') ? 403 : 401).json({ error: message });
    }
  });

  // Step 3: Verify Authorized Google Identity + Issue Secure HttpOnly Session Cookie
  app.post('/api/secure-control/auth/step3', async (req, res) => {
    const ip = getClientIp(req);
    const ua = String(req.headers['user-agent'] || 'unknown');
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Rate limit exceeded. Wait 60 seconds.' });
      return;
    }
    try {
      const user = await verifyAdminIdentity(req);
      const { challengeId, verificationNonce } = req.body as {
        challengeId?: string;
        verificationNonce?: string;
      };
      if (!challengeId || !verificationNonce) {
        res.status(400).json({ error: 'Missing Step 2 authenticator verification proof.' });
        return;
      }
      const session = completeStep3Session({
        uid: user.uid,
        email: user.email,
        authorizedEmail: AUTHORIZED_ADMIN_EMAIL,
        challengeId,
        verificationNonce,
        ip,
        userAgent: ua,
      });

      const maxAgeSec = Math.max(60, Math.floor((session.expiresAtMs - Date.now()) / 1000));
      res.setHeader('Set-Cookie', buildAdminCookie(req, session.sessionId, maxAgeSec));
      res.json({
        authenticated: true,
        expiresAtMs: session.expiresAtMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Step 3 verification failed';
      res.status(message.startsWith('FORBIDDEN') ? 403 : 401).json({ error: message });
    }
  });

  // Logout & Clear Secure Cookie
  app.post('/api/secure-control/logout', async (req, res) => {
    const ip = getClientIp(req);
    const ua = String(req.headers['user-agent'] || 'unknown');
    const cookieSid = parseCookie(req.headers.cookie, ADMIN_COOKIE_NAME);
    let email = 'unknown';
    try {
      const user = await verifyFirebaseUser(req.headers.authorization);
      email = user.email;
    } catch {
      // Allow logout cleanup even if Firebase token already expired
    }
    revokeAdminSession(cookieSid, email, ip, ua);
    res.setHeader('Set-Cookie', buildAdminCookie(req, '', 0));
    res.json({ loggedOut: true });
  });

  // Protected: Security Logs (login activity, failed attempts, lockouts, credential changes)
  app.get('/api/secure-control/security-logs', async (req, res) => {
    try {
      await requireAdminSession(req);
      res.json({ logs: readSecurityLogs() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unauthorized';
      res.status(401).json({ error: message });
    }
  });

  // Protected: Record backend security log for critical admin operations
  app.post('/api/secure-control/audit', async (req, res) => {
    try {
      const { user } = await requireAdminSession(req);
      const { event, details, severity } = req.body as {
        event?: string;
        details?: string;
        severity?: 'INFO' | 'WARNING' | 'CRITICAL';
      };
      if (event && details) {
        appendSecurityLog({
          event: String(event).slice(0, 64),
          severity: severity === 'CRITICAL' || severity === 'WARNING' ? severity : 'INFO',
          email: user.email,
          ip: getClientIp(req),
          userAgent: String(req.headers['user-agent'] || 'unknown'),
          details: String(details).slice(0, 500),
        });
      }
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unauthorized';
      res.status(401).json({ error: message });
    }
  });

  function authErrorStatus(err: unknown): number {
    const message = err instanceof Error ? err.message : '';
    if (message.startsWith('FORBIDDEN')) return 403;
    if (
      message.startsWith('SESSION_REQUIRED') ||
      message.includes('token') ||
      message.includes('Bearer') ||
      message.includes('gmail')
    ) {
      return 401;
    }
    return 400;
  }

  // Protected Owner-Only Settings Endpoints
  app.post('/api/secure-control/settings/password', async (req, res) => {
    try {
      const { user } = await requireAdminSession(req);
      if (user.email !== AUTHORIZED_ADMIN_EMAIL) {
        res.status(403).json({
          error: 'Only the authorized owner can change administrator credentials.',
        });
        return;
      }
      const { currentPassword, newPassword } = req.body as {
        currentPassword?: string;
        newPassword?: string;
      };
      ownerChangePassword({
        email: user.email,
        currentPassword: currentPassword || '',
        newPassword: newPassword || '',
        ip: getClientIp(req),
        userAgent: String(req.headers['user-agent'] || 'unknown'),
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(authErrorStatus(err)).json({ error: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/secure-control/settings/rotate-card', async (req, res) => {
    try {
      const { user } = await requireAdminSession(req);
      if (user.email !== AUTHORIZED_ADMIN_EMAIL) {
        res.status(403).json({
          error: 'Only the authorized owner can rotate the Security Card.',
        });
        return;
      }
      const { currentPassword } = req.body as { currentPassword?: string };
      const rotated = ownerRotateSecurityCard({
        email: user.email,
        currentPassword: currentPassword || '',
        ip: getClientIp(req),
        userAgent: String(req.headers['user-agent'] || 'unknown'),
      });
      res.json(rotated);
    } catch (err) {
      res.status(authErrorStatus(err)).json({ error: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/secure-control/settings/totp', async (req, res) => {
    try {
      const { user } = await requireAdminSession(req);
      if (user.email !== AUTHORIZED_ADMIN_EMAIL) {
        res.status(403).json({
          error: 'Only the authorized owner can configure TOTP 2FA.',
        });
        return;
      }
      const { action, secret, code, currentPassword } = req.body as {
        action?: 'BEGIN' | 'CONFIRM';
        secret?: string;
        code?: string;
        currentPassword?: string;
      };
      if (action !== 'BEGIN' && action !== 'CONFIRM') {
        res.status(400).json({
          error: 'Mandatory 6-digit TOTP 2FA cannot be disabled. Use BEGIN or CONFIRM to rotate.',
        });
        return;
      }
      const result = ownerRotateMandatoryTotp({
        email: user.email,
        action,
        currentPassword,
        secret,
        code,
        ip: getClientIp(req),
        userAgent: String(req.headers['user-agent'] || 'unknown'),
      });
      res.json(result);
    } catch (err) {
      res.status(authErrorStatus(err)).json({ error: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/secure-control/settings/session-ttl', async (req, res) => {
    try {
      const { user } = await requireAdminSession(req);
      if (user.email !== AUTHORIZED_ADMIN_EMAIL) {
        res.status(403).json({ error: 'Owner permission required.' });
        return;
      }
      const { ttlMinutes } = req.body as { ttlMinutes?: number };
      const ttl = ownerUpdateSessionTtl({
        email: user.email,
        ttlMinutes: Number(ttlMinutes) || 30,
        ip: getClientIp(req),
        userAgent: String(req.headers['user-agent'] || 'unknown'),
      });
      res.json({ sessionTtlMinutes: ttl });
    } catch (err) {
      res.status(authErrorStatus(err)).json({ error: err instanceof Error ? err.message : 'Failed' });
    }
  });

  app.post('/api/secure-control/settings/revoke-all', async (req, res) => {
    try {
      const { user } = await requireAdminSession(req);
      if (user.email !== AUTHORIZED_ADMIN_EMAIL) {
        res.status(403).json({ error: 'Owner permission required.' });
        return;
      }
      revokeAllAdminSessions(
        user.email,
        getClientIp(req),
        String(req.headers['user-agent'] || 'unknown')
      );
      res.setHeader('Set-Cookie', buildAdminCookie(req, '', 0));
      res.json({ revoked: true });
    } catch (err) {
      res.status(authErrorStatus(err)).json({ error: err instanceof Error ? err.message : 'Failed' });
    }
  });

  // Protected: list active server rounds & lock states
  app.get('/api/secure-control/futures/rounds', async (req, res) => {
    try {
      await requireAdminSession(req);
      const now = Date.now();
      const rounds = Array.from(activeRounds.values()).map((r) => ({
        ...r,
        isLocked: r.locked || now >= r.lockAtMs || r.settled,
        serverTimeMs: now,
      }));
      res.json({ rounds, serverTimeMs: now });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unauthorized';
      res.status(401).json({ error: message });
    }
  });

  // Protected: configure WIN / LOSE outcome before round is locked
  app.post('/api/secure-control/futures/:tradeId/outcome', async (req, res) => {
    try {
      const { user } = await requireAdminSession(req);
      const { tradeId } = req.params;
      const { outcome, lock } = req.body as {
        outcome?: 'AUTO' | 'WIN' | 'LOSE';
        lock?: boolean;
      };

      if (outcome !== 'AUTO' && outcome !== 'WIN' && outcome !== 'LOSE') {
        res.status(400).json({ error: 'Outcome must be AUTO, WIN, or LOSE' });
        return;
      }

      let round = activeRounds.get(tradeId);
      if (!round) {
        const hydrated = await hydrateRoundFromFirestore(tradeId, user.idToken);
        if (!hydrated) {
          res.status(404).json({ error: 'Active trade round not found' });
          return;
        }
        round = hydrated;
      }

      const now = Date.now();
      if (round.settled) {
        res.status(409).json({ error: 'Trade round is already settled.' });
        return;
      }
      if (round.locked || now >= round.lockAtMs) {
        round.locked = true;
        res.status(409).json({
          error: 'Trading round is locked. Configured outcome can no longer be modified.',
        });
        return;
      }

      round.configuredOutcome = outcome;
      if (lock === true) {
        round.locked = true;
      }

      appendSecurityLog({
        event: 'FUTURES_OUTCOME_CONFIGURED',
        severity: 'INFO',
        email: user.email,
        ip: getClientIp(req),
        userAgent: String(req.headers['user-agent'] || 'unknown'),
        details: `Trade ${tradeId} (${round.symbol} ${round.direction}) configured to ${outcome} (locked=${round.locked}).`,
      });

      res.json({
        tradeId: round.tradeId,
        configuredOutcome: round.configuredOutcome,
        locked: round.locked,
        lockAtMs: round.lockAtMs,
        serverTimeMs: now,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to configure trade outcome';
      res.status(400).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Veltrix Exchange server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
