import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VAULT_DIR = path.join(__dirname, '.secure-vault');
const VAULT_FILE = path.join(VAULT_DIR, 'admin-vault.json');
const LOGS_FILE = path.join(VAULT_DIR, 'security-logs.json');

const CARD_ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];
const CARD_COLS = ['1', '2', '3', '4'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 20;

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

interface AdminVaultData {
  ownerEmail: string;
  passwordHash: string;
  cardId: string;
  cardCellHashes: Record<string, string>;
  totpEnabled: boolean;
  totpSecret: string | null;
  lastTotpCounter?: number;
  sessionTtlMinutes: number;
  failedAttempts: number;
  lockedUntilMs: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface AdminSessionRecord {
  sessionId: string;
  uid: string;
  email: string;
  createdAtMs: number;
  expiresAtMs: number;
  lastActivityMs: number;
  ip: string;
}

interface PendingChallenge {
  challengeId: string;
  email: string;
  step1Verified: boolean;
  step2Verified: boolean;
  verificationNonce: string | null;
  expiresAtMs: number;
}

interface PendingOwnerSetup {
  setupId: string;
  uid: string;
  ownerEmail: string;
  passwordHash: string;
  totpSecret: string;
  otpauthUri: string;
  expiresAtMs: number;
}

const activeSessions = new Map<string, AdminSessionRecord>();
const pendingChallenges = new Map<string, PendingChallenge>();
const pendingSetups = new Map<string, PendingOwnerSetup>();
const pendingLegacyTotpEnrollments = new Map<
  string,
  { challengeId: string; uid: string; secret: string; expiresAtMs: number }
>();
const ipRateMap = new Map<string, { count: number; windowStartMs: number }>();

function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
  }
}

export function hashSecret(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64, { N: 16384, r: 8, p: 1 });
  return `${salt}:${derived.toString('hex')}`;
}

export function verifySecret(plain: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, hexHash] = parts;
  if (!salt || !hexHash) return false;
  const expected = Buffer.from(hexHash, 'hex');
  const actual = crypto.scryptSync(plain, salt, 64, { N: 16384, r: 8, p: 1 });
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function readVault(): AdminVaultData | null {
  try {
    if (!fs.existsSync(VAULT_FILE)) return null;
    const raw = fs.readFileSync(VAULT_FILE, 'utf-8');
    return JSON.parse(raw) as AdminVaultData;
  } catch {
    return null;
  }
}

function writeVault(data: AdminVaultData) {
  ensureVaultDir();
  fs.writeFileSync(VAULT_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function readSecurityLogs(): SecurityLogEntry[] {
  try {
    if (!fs.existsSync(LOGS_FILE)) return [];
    const raw = fs.readFileSync(LOGS_FILE, 'utf-8');
    return JSON.parse(raw) as SecurityLogEntry[];
  } catch {
    return [];
  }
}

export function appendSecurityLog(entry: Omit<SecurityLogEntry, 'id' | 'timestampMs'>) {
  ensureVaultDir();
  const logs = readSecurityLogs();
  const next: SecurityLogEntry = {
    id: `sec_${crypto.randomBytes(6).toString('hex')}`,
    timestampMs: Date.now(),
    ...entry,
  };
  const trimmed = [next, ...logs].slice(0, 500);
  fs.writeFileSync(LOGS_FILE, JSON.stringify(trimmed, null, 2), { mode: 0o600 });
}

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const existing = ipRateMap.get(ip);
  if (!existing || now - existing.windowStartMs > RATE_WINDOW_MS) {
    ipRateMap.set(ip, { count: 1, windowStartMs: now });
    return true;
  }
  if (existing.count >= RATE_MAX_REQUESTS) {
    return false;
  }
  existing.count += 1;
  return true;
}

function generateRandomCode(length = 4): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function generateSecurityCardMatrix(): {
  cardId: string;
  plainGrid: Record<string, string>;
  hashedGrid: Record<string, string>;
} {
  const cardId = `VTX-CARD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const plainGrid: Record<string, string> = {};
  const hashedGrid: Record<string, string> = {};

  for (const row of CARD_ROWS) {
    for (const col of CARD_COLS) {
      const coord = `${row}${col}`;
      const code = generateRandomCode(4);
      plainGrid[coord] = code;
      hashedGrid[coord] = hashSecret(code);
    }
  }
  return { cardId, plainGrid, hashedGrid };
}

// RFC 6238 TOTP generation & verification using Node crypto
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(): string {
  const bytes = crypto.randomBytes(20);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function buildOtpAuthUri(email: string, secret: string): string {
  return `otpauth://totp/Veltrix%20Secure%20Control:${encodeURIComponent(
    email
  )}?secret=${secret}&issuer=Veltrix%20Secure%20Control&algorithm=SHA1&digits=6&period=30`;
}

export function verifyTotpCode(
  secret: string,
  code: string,
  lastCounterUsed?: number
): { valid: boolean; matchedCounter?: number; replayed?: boolean } {
  const cleanCode = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) {
    return { valid: false };
  }
  const key = decodeBase32(secret);
  const currentCounter = Math.floor(Date.now() / 1000 / 30);

  for (const offset of [-1, 0, 1]) {
    const counter = currentCounter + offset;
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    buf.writeUInt32BE(counter >>> 0, 4);
    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const pos = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[pos] & 0x7f) << 24) |
      ((hmac[pos + 1] & 0xff) << 16) |
      ((hmac[pos + 2] & 0xff) << 8) |
      (hmac[pos + 3] & 0xff);
    const otp = String(binary % 1_000_000).padStart(6, '0');
    if (crypto.timingSafeEqual(Buffer.from(otp), Buffer.from(cleanCode))) {
      if (typeof lastCounterUsed === 'number' && counter <= lastCounterUsed) {
        return { valid: false, replayed: true };
      }
      return { valid: true, matchedCounter: counter };
    }
  }
  return { valid: false };
}

export function beginOwnerVaultSetup(params: {
  uid: string;
  ownerEmail: string;
  password: string;
  ip: string;
  userAgent: string;
}): { setupId: string; totpSecret: string; otpauthUri: string; expiresAtMs: number } {
  if (readVault()) {
    throw new Error('Administrator vault is already initialized.');
  }
  if (!params.password || params.password.length < 10) {
    throw new Error('Administrator password must be at least 10 characters.');
  }

  const setupId = `stp_${crypto.randomBytes(16).toString('hex')}`;
  const totpSecret = generateBase32Secret();
  const otpauthUri = buildOtpAuthUri(params.ownerEmail.toLowerCase(), totpSecret);
  const expiresAtMs = Date.now() + 5 * 60 * 1000;

  pendingSetups.set(setupId, {
    setupId,
    uid: params.uid,
    ownerEmail: params.ownerEmail.toLowerCase(),
    passwordHash: hashSecret(params.password),
    totpSecret,
    otpauthUri,
    expiresAtMs,
  });

  appendSecurityLog({
    event: 'OWNER_SETUP_INITIATED',
    severity: 'INFO',
    email: params.ownerEmail,
    ip: params.ip,
    userAgent: params.userAgent,
    details: 'Authorized owner began password & mandatory TOTP authenticator provisioning.',
  });

  return { setupId, totpSecret, otpauthUri, expiresAtMs };
}

export function completeOwnerVaultSetup(params: {
  uid: string;
  setupId: string;
  totpCode: string;
  ip: string;
  userAgent: string;
}): { cardId: string; plainGrid: Record<string, string> } {
  if (readVault()) {
    throw new Error('Administrator vault is already initialized.');
  }
  const pending = pendingSetups.get(params.setupId);
  if (!pending || pending.uid !== params.uid || Date.now() > pending.expiresAtMs) {
    pendingSetups.delete(params.setupId);
    throw new Error('Setup session expired. Please restart owner credential setup.');
  }

  const totpCheck = verifyTotpCode(pending.totpSecret, params.totpCode);
  if (!totpCheck.valid) {
    throw new Error('Invalid 6-digit authenticator verification code. Check your authenticator clock and retry.');
  }

  pendingSetups.delete(params.setupId);

  const { cardId, plainGrid, hashedGrid } = generateSecurityCardMatrix();
  const now = Date.now();
  const vault: AdminVaultData = {
    ownerEmail: pending.ownerEmail,
    passwordHash: pending.passwordHash,
    cardId,
    cardCellHashes: hashedGrid,
    totpEnabled: true,
    totpSecret: pending.totpSecret,
    lastTotpCounter: totpCheck.matchedCounter,
    sessionTtlMinutes: 30,
    failedAttempts: 0,
    lockedUntilMs: 0,
    createdAtMs: now,
    updatedAtMs: now,
  };
  writeVault(vault);

  appendSecurityLog({
    event: 'OWNER_VAULT_INITIALIZED',
    severity: 'INFO',
    email: pending.ownerEmail,
    ip: params.ip,
    userAgent: params.userAgent,
    details: `Owner initialized scrypt password hash, mandatory TOTP 2FA, and backup Security Card ${cardId}.`,
  });

  return { cardId, plainGrid };
}

export function getLockoutRemainingMs(vault: AdminVaultData): number {
  const rem = vault.lockedUntilMs - Date.now();
  return rem > 0 ? rem : 0;
}

function recordFailedAttempt(
  vault: AdminVaultData,
  event: string,
  email: string,
  ip: string,
  userAgent: string,
  details: string
): { lockedOut: boolean; lockoutRemainingMs: number } {
  vault.failedAttempts += 1;
  vault.updatedAtMs = Date.now();
  let lockedOut = false;

  if (vault.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    vault.lockedUntilMs = Date.now() + LOCKOUT_DURATION_MS;
    vault.failedAttempts = 0;
    lockedOut = true;
  }
  writeVault(vault);

  appendSecurityLog({
    event,
    severity: lockedOut ? 'CRITICAL' : 'WARNING',
    email,
    ip,
    userAgent,
    details: lockedOut
      ? `${details} Maximum failed attempts reached — temporary 15-minute lockout activated.`
      : `${details} (Attempt ${vault.failedAttempts}/${MAX_FAILED_ATTEMPTS})`,
  });

  return {
    lockedOut,
    lockoutRemainingMs: getLockoutRemainingMs(vault),
  };
}

export function verifyStep1EmailPassword(params: {
  email: string;
  password: string;
  authorizedEmail: string;
  ip: string;
  userAgent: string;
}): {
  challengeId: string;
  totpRequired: true;
  needsTotpEnrollment: boolean;
  expiresAtMs: number;
} {
  const vault = readVault();
  if (!vault) {
    throw new Error('Administrator vault has not been initialized by the owner yet.');
  }

  const lockRem = getLockoutRemainingMs(vault);
  if (lockRem > 0) {
    throw new Error(`LOCKED:${Math.ceil(lockRem / 1000)}`);
  }

  const normalizedInputEmail = params.email.trim().toLowerCase();
  const normalizedAuthorized = params.authorizedEmail.trim().toLowerCase();

  if (!normalizedInputEmail || normalizedInputEmail !== normalizedAuthorized) {
    const res = recordFailedAttempt(
      vault,
      'UNAUTHORIZED_ADMIN_EMAIL_ATTEMPT',
      normalizedInputEmail || 'empty',
      params.ip,
      params.userAgent,
      `Unauthorized email "${normalizedInputEmail || 'empty'}" attempted admin Step 1 login.`
    );
    if (res.lockedOut) {
      throw new Error(`LOCKED:${Math.ceil(res.lockoutRemainingMs / 1000)}`);
    }
    throw new Error('Invalid administrator email or password.');
  }

  const valid = verifySecret(params.password, vault.passwordHash);
  if (!valid) {
    const res = recordFailedAttempt(
      vault,
      'STEP1_FAILED_PASSWORD',
      normalizedInputEmail,
      params.ip,
      params.userAgent,
      'Invalid administrator password submitted in Step 1.'
    );
    if (res.lockedOut) {
      throw new Error(`LOCKED:${Math.ceil(res.lockoutRemainingMs / 1000)}`);
    }
    throw new Error('Invalid administrator email or password.');
  }

  const challengeId = `chl_${crypto.randomBytes(16).toString('hex')}`;
  const expiresAtMs = Date.now() + 4 * 60 * 1000;
  const needsTotpEnrollment = !vault.totpEnabled || !vault.totpSecret;

  pendingChallenges.set(challengeId, {
    challengeId,
    email: normalizedAuthorized,
    step1Verified: true,
    step2Verified: false,
    verificationNonce: null,
    expiresAtMs,
  });

  appendSecurityLog({
    event: 'STEP1_EMAIL_PASSWORD_VERIFIED',
    severity: 'INFO',
    email: normalizedAuthorized,
    ip: params.ip,
    userAgent: params.userAgent,
    details: 'Step 1 authorized Gmail and scrypt password verified; awaiting mandatory 6-digit TOTP verification.',
  });

  return {
    challengeId,
    totpRequired: true,
    needsTotpEnrollment,
    expiresAtMs,
  };
}

export function beginLegacyTotpEnrollment(params: {
  challengeId: string;
  uid: string;
  email: string;
}): { secret: string; otpauthUri: string } {
  const challenge = pendingChallenges.get(params.challengeId);
  if (!challenge || !challenge.step1Verified || Date.now() > challenge.expiresAtMs) {
    throw new Error('Authentication challenge expired. Restart from Step 1.');
  }
  const secret = generateBase32Secret();
  const otpauthUri = buildOtpAuthUri(params.email, secret);
  pendingLegacyTotpEnrollments.set(params.challengeId, {
    challengeId: params.challengeId,
    uid: params.uid,
    secret,
    expiresAtMs: Date.now() + 5 * 60 * 1000,
  });
  return { secret, otpauthUri };
}

export function completeLegacyTotpEnrollment(params: {
  challengeId: string;
  uid: string;
  email: string;
  totpCode: string;
  ip: string;
  userAgent: string;
}): { verificationNonce: string } {
  const vault = readVault();
  if (!vault) throw new Error('Vault not initialized.');
  const challenge = pendingChallenges.get(params.challengeId);
  const enrollment = pendingLegacyTotpEnrollments.get(params.challengeId);
  if (
    !challenge ||
    !challenge.step1Verified ||
    !enrollment ||
    enrollment.uid !== params.uid ||
    Date.now() > enrollment.expiresAtMs
  ) {
    throw new Error('Enrollment session expired. Restart login from Step 1.');
  }

  const check = verifyTotpCode(enrollment.secret, params.totpCode);
  if (!check.valid) {
    throw new Error('Invalid 6-digit authenticator verification code.');
  }

  pendingLegacyTotpEnrollments.delete(params.challengeId);
  vault.totpEnabled = true;
  vault.totpSecret = enrollment.secret;
  vault.lastTotpCounter = check.matchedCounter;
  vault.updatedAtMs = Date.now();
  writeVault(vault);

  const verificationNonce = crypto.randomBytes(20).toString('hex');
  challenge.step2Verified = true;
  challenge.verificationNonce = verificationNonce;

  appendSecurityLog({
    event: 'MANDATORY_TOTP_ENROLLED',
    severity: 'INFO',
    email: params.email,
    ip: params.ip,
    userAgent: params.userAgent,
    details: 'Owner completed mandatory 6-digit TOTP authenticator enrollment during login.',
  });

  return { verificationNonce };
}

export function verifyStep2Totp(params: {
  challengeId: string;
  totpCode: string;
  ip: string;
  userAgent: string;
}): { verificationNonce: string } {
  const vault = readVault();
  if (!vault) {
    throw new Error('Administrator vault not initialized.');
  }

  const lockRem = getLockoutRemainingMs(vault);
  if (lockRem > 0) {
    throw new Error(`LOCKED:${Math.ceil(lockRem / 1000)}`);
  }

  const challenge = pendingChallenges.get(params.challengeId);
  if (!challenge || !challenge.step1Verified || Date.now() > challenge.expiresAtMs) {
    pendingChallenges.delete(params.challengeId);
    throw new Error('Authentication challenge expired. Restart from Step 1.');
  }

  if (!vault.totpEnabled || !vault.totpSecret) {
    throw new Error('TOTP_ENROLLMENT_REQUIRED: Mandatory 6-digit authenticator setup required.');
  }

  const check = verifyTotpCode(vault.totpSecret, params.totpCode, vault.lastTotpCounter);
  if (!check.valid) {
    if (check.replayed) {
      throw new Error('This 6-digit code was already used. Wait for the next 30-second authenticator code.');
    }
    const res = recordFailedAttempt(
      vault,
      'STEP2_FAILED_TOTP',
      challenge.email,
      params.ip,
      params.userAgent,
      'Invalid 6-digit authenticator (TOTP) code submitted in Step 2.'
    );
    if (res.lockedOut) {
      pendingChallenges.delete(params.challengeId);
      throw new Error(`LOCKED:${Math.ceil(res.lockoutRemainingMs / 1000)}`);
    }
    throw new Error('Invalid 6-digit authenticator code.');
  }

  vault.lastTotpCounter = check.matchedCounter;
  vault.updatedAtMs = Date.now();
  writeVault(vault);

  const verificationNonce = crypto.randomBytes(20).toString('hex');
  challenge.step2Verified = true;
  challenge.verificationNonce = verificationNonce;

  appendSecurityLog({
    event: 'STEP2_TOTP_VERIFIED',
    severity: 'INFO',
    email: challenge.email,
    ip: params.ip,
    userAgent: params.userAgent,
    details: 'Mandatory 6-digit TOTP authenticator code verified.',
  });

  return { verificationNonce };
}

export function completeStep3Session(params: {
  uid: string;
  email: string;
  authorizedEmail: string;
  challengeId: string;
  verificationNonce: string;
  ip: string;
  userAgent: string;
}): AdminSessionRecord {
  const vault = readVault();
  if (!vault) {
    throw new Error('Administrator vault not initialized.');
  }

  if (params.email.trim().toLowerCase() !== params.authorizedEmail.trim().toLowerCase()) {
    appendSecurityLog({
      event: 'UNAUTHORIZED_ADMIN_ACCESS_BLOCKED',
      severity: 'CRITICAL',
      email: params.email,
      ip: params.ip,
      userAgent: params.userAgent,
      details: `Unauthorized Gmail ${params.email} attempted Step 3 admin session exchange.`,
    });
    throw new Error('FORBIDDEN: Only the authorized administrator Gmail can enter.');
  }

  const challenge = pendingChallenges.get(params.challengeId);
  if (
    !challenge ||
    challenge.email !== params.authorizedEmail.trim().toLowerCase() ||
    !challenge.step1Verified ||
    !challenge.step2Verified ||
    challenge.verificationNonce !== params.verificationNonce ||
    Date.now() > challenge.expiresAtMs
  ) {
    pendingChallenges.delete(params.challengeId);
    appendSecurityLog({
      event: 'STEP3_VERIFICATION_FAILED',
      severity: 'WARNING',
      email: params.email,
      ip: params.ip,
      userAgent: params.userAgent,
      details: 'Step 3 server session verification failed or challenge expired.',
    });
    throw new Error('Multi-factor verification failed or expired. Restart from Step 1.');
  }

  pendingChallenges.delete(params.challengeId);

  vault.failedAttempts = 0;
  vault.lockedUntilMs = 0;
  vault.updatedAtMs = Date.now();
  writeVault(vault);

  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const ttlMs = Math.max(5, Math.min(240, vault.sessionTtlMinutes)) * 60 * 1000;
  const session: AdminSessionRecord = {
    sessionId,
    uid: params.uid,
    email: params.email,
    createdAtMs: now,
    expiresAtMs: now + ttlMs,
    lastActivityMs: now,
    ip: params.ip,
  };
  activeSessions.set(sessionId, session);

  appendSecurityLog({
    event: 'ADMIN_LOGIN_SUCCESS',
    severity: 'INFO',
    email: params.email,
    ip: params.ip,
    userAgent: params.userAgent,
    details: `Email/Password + mandatory 6-digit TOTP + authorized Gmail verified. Session issued (${vault.sessionTtlMinutes}m TTL).`,
  });

  return session;
}

export function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eqIdx + 1).trim());
    }
  }
  return null;
}

export function getValidAdminSession(
  sessionId: string | null,
  uid: string,
  email: string,
  authorizedEmail: string
): AdminSessionRecord | null {
  if (!sessionId) return null;
  if (email.trim().toLowerCase() !== authorizedEmail.trim().toLowerCase()) {
    return null;
  }
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  if (session.uid !== uid || Date.now() > session.expiresAtMs) {
    if (Date.now() > session.expiresAtMs) {
      activeSessions.delete(sessionId);
    }
    return null;
  }
  session.lastActivityMs = Date.now();
  return session;
}

export function revokeAdminSession(
  sessionId: string | null,
  email: string,
  ip: string,
  userAgent: string
) {
  if (sessionId && activeSessions.has(sessionId)) {
    activeSessions.delete(sessionId);
    appendSecurityLog({
      event: 'ADMIN_LOGOUT',
      severity: 'INFO',
      email,
      ip,
      userAgent,
      details: 'Administrator explicitly terminated secure session.',
    });
  }
}

export function revokeAllAdminSessions(email: string, ip: string, userAgent: string) {
  const count = activeSessions.size;
  activeSessions.clear();
  appendSecurityLog({
    event: 'ALL_ADMIN_SESSIONS_REVOKED',
    severity: 'WARNING',
    email,
    ip,
    userAgent,
    details: `Owner revoked ${count} active administrator session(s).`,
  });
}

export function ownerChangePassword(params: {
  email: string;
  currentPassword: string;
  newPassword: string;
  ip: string;
  userAgent: string;
}) {
  const vault = readVault();
  if (!vault) throw new Error('Vault not initialized');
  if (!verifySecret(params.currentPassword, vault.passwordHash)) {
    throw new Error('Current administrator password is incorrect.');
  }
  if (params.newPassword.length < 10) {
    throw new Error('New password must be at least 10 characters.');
  }
  vault.passwordHash = hashSecret(params.newPassword);
  vault.updatedAtMs = Date.now();
  writeVault(vault);
  appendSecurityLog({
    event: 'ADMIN_PASSWORD_CHANGED',
    severity: 'WARNING',
    email: params.email,
    ip: params.ip,
    userAgent: params.userAgent,
    details: 'Authorized owner updated the administrator password hash.',
  });
}

export function ownerRotateSecurityCard(params: {
  email: string;
  currentPassword: string;
  ip: string;
  userAgent: string;
}): { cardId: string; plainGrid: Record<string, string> } {
  const vault = readVault();
  if (!vault) throw new Error('Vault not initialized');
  if (!verifySecret(params.currentPassword, vault.passwordHash)) {
    throw new Error('Current administrator password is required to rotate the Security Card.');
  }
  const { cardId, plainGrid, hashedGrid } = generateSecurityCardMatrix();
  vault.cardId = cardId;
  vault.cardCellHashes = hashedGrid;
  vault.updatedAtMs = Date.now();
  writeVault(vault);
  appendSecurityLog({
    event: 'SECURITY_CARD_ROTATED',
    severity: 'WARNING',
    email: params.email,
    ip: params.ip,
    userAgent: params.userAgent,
    details: `Authorized owner generated new backup Security Card ${cardId}.`,
  });
  return { cardId, plainGrid };
}

export function ownerUpdateSessionTtl(params: {
  email: string;
  ttlMinutes: number;
  ip: string;
  userAgent: string;
}) {
  const vault = readVault();
  if (!vault) throw new Error('Vault not initialized');
  const clamped = Math.max(5, Math.min(240, Math.floor(params.ttlMinutes)));
  vault.sessionTtlMinutes = clamped;
  vault.updatedAtMs = Date.now();
  writeVault(vault);
  appendSecurityLog({
    event: 'ADMIN_SESSION_TTL_UPDATED',
    severity: 'INFO',
    email: params.email,
    ip: params.ip,
    userAgent: params.userAgent,
    details: `Updated administrator session expiration timeout to ${clamped} minutes.`,
  });
  return clamped;
}

export function ownerRotateMandatoryTotp(params: {
  email: string;
  action: 'BEGIN' | 'CONFIRM';
  currentPassword?: string;
  secret?: string;
  code?: string;
  ip: string;
  userAgent: string;
}): { totpEnabled: true; secret?: string; otpauthUri?: string } {
  const vault = readVault();
  if (!vault) throw new Error('Vault not initialized');

  if (params.action === 'BEGIN') {
    if (!params.currentPassword || !verifySecret(params.currentPassword, vault.passwordHash)) {
      throw new Error('Current administrator password is required to rotate the authenticator key.');
    }
    const secret = generateBase32Secret();
    const otpauthUri = buildOtpAuthUri(params.email, secret);
    return { totpEnabled: true, secret, otpauthUri };
  }

  if (!params.secret || !params.code) {
    throw new Error('Secret and 6-digit verification code are required.');
  }
  const check = verifyTotpCode(params.secret, params.code);
  if (!check.valid) {
    throw new Error('Invalid 6-digit authenticator verification code.');
  }

  vault.totpEnabled = true;
  vault.totpSecret = params.secret;
  vault.lastTotpCounter = check.matchedCounter;
  vault.updatedAtMs = Date.now();
  writeVault(vault);

  appendSecurityLog({
    event: 'ADMIN_TOTP_2FA_ROTATED',
    severity: 'WARNING',
    email: params.email,
    ip: params.ip,
    userAgent: params.userAgent,
    details: 'Authorized owner rotated mandatory 6-digit TOTP authenticator secret.',
  });

  return { totpEnabled: true };
}

export function getActiveSessionsCount(): number {
  const now = Date.now();
  for (const [id, sess] of activeSessions.entries()) {
    if (now > sess.expiresAtMs) activeSessions.delete(id);
  }
  return activeSessions.size;
}
