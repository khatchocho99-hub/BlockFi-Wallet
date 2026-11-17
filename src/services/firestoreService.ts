import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import {
  DEFAULT_WALLET_CONFIGS,
  type AdminTradeConfig,
  type AuditLog,
  type DocumentType,
  type FuturesTrade,
  type KycSubmission,
  type SupportMessage,
  type SupportStatus,
  type SupportTicket,
  type UserProfile,
  type UserSettings,
  type WalletAddressConfig,
  type WalletTransaction,
} from '../types/exchange';

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

// --- User Profile ---

export async function createUserProfile(params: {
  uid: string;
  email: string;
  username: string;
  photoURL: string;
}): Promise<void> {
  const path = `users/${params.uid}`;
  try {
    const cleanUsername = params.username.trim().slice(0, 60) || 'Trader';
    const safeUsername = cleanUsername.length >= 2 ? cleanUsername : `${cleanUsername}01`;
    const accountId = `VTX_${params.uid.slice(0, 8).toUpperCase()}`.replace(/[^a-zA-Z0-9_-]/g, '');
    await setDoc(doc(db, 'users', params.uid), {
      uid: params.uid,
      email: params.email.toLowerCase(),
      username: safeUsername,
      photoURL: (params.photoURL || '').slice(0, 500),
      accountId,
      role: 'customer',
      kycStatus: 'NOT_SUBMITTED',
      availableBalance: 10000,
      tradingBalance: 0,
      totalPnl: 0,
      favoriteCoins: ['bitcoin', 'ethereum', 'solana'],
      settings: {
        currency: 'USD',
        compactMode: false,
        confirmTrades: true,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void
): Unsubscribe {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as UserProfile) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function updateUserPreferences(
  uid: string,
  updates: {
    username?: string;
    favoriteCoins?: string[];
    settings?: UserSettings;
  }
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.username !== undefined) {
      const clean = updates.username.trim().slice(0, 60);
      if (clean.length < 2) throw new Error('Username must be at least 2 characters');
      payload.username = clean;
    }
    if (updates.favoriteCoins !== undefined) {
      payload.favoriteCoins = updates.favoriteCoins.slice(0, 30);
    }
    if (updates.settings !== undefined) {
      payload.settings = {
        currency: updates.settings.currency || 'USD',
        compactMode: Boolean(updates.settings.compactMode),
        confirmTrades: Boolean(updates.settings.confirmTrades),
      };
    }
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function checkIsAdminRecord(uid: string): Promise<boolean> {
  const path = `admins/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch {
    return false;
  }
}

// --- Futures Trades ---

export async function recordPlacedTradeInFirestore(params: {
  tradeId: string;
  uid: string;
  userEmail: string;
  coinId: string;
  symbol: string;
  coinName: string;
  direction: 'LONG' | 'SHORT';
  amount: number;
  profitRate: number;
  entryPrice: number;
  durationSeconds: number;
  startedAtMs: number;
  lockAtMs: number;
  expiresAtMs: number;
  currentAvailableBalance: number;
  currentTradingBalance: number;
}): Promise<void> {
  const path = `trades/${params.tradeId}`;
  try {
    const batch = writeBatch(db);
    const nextAvailable = Number((params.currentAvailableBalance - params.amount).toFixed(2));
    const nextTrading = Number((params.currentTradingBalance + params.amount).toFixed(2));

    batch.set(doc(db, 'trades', params.tradeId), {
      id: params.tradeId,
      uid: params.uid,
      userEmail: params.userEmail.toLowerCase(),
      coinId: params.coinId.slice(0, 64),
      symbol: params.symbol.toUpperCase().slice(0, 16),
      coinName: params.coinName.slice(0, 64),
      direction: params.direction,
      amount: params.amount,
      profitRate: params.profitRate,
      entryPrice: params.entryPrice,
      exitPrice: 0,
      durationSeconds: params.durationSeconds,
      startedAtMs: params.startedAtMs,
      lockAtMs: params.lockAtMs,
      expiresAtMs: params.expiresAtMs,
      status: 'ACTIVE',
      result: 'PENDING',
      payout: 0,
      netPnl: 0,
      settlementSignature: 'pending',
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'users', params.uid), {
      availableBalance: nextAvailable,
      tradingBalance: nextTrading,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function settleTradeInFirestore(params: {
  trade: FuturesTrade;
  result: 'WIN' | 'LOSE';
  exitPrice: number;
  payout: number;
  netPnl: number;
  settlementSignature: string;
  currentAvailableBalance: number;
  currentTradingBalance: number;
  currentTotalPnl: number;
}): Promise<void> {
  const path = `trades/${params.trade.id}`;
  try {
    const batch = writeBatch(db);
    const nextTrading = Math.max(
      0,
      Number((params.currentTradingBalance - params.trade.amount).toFixed(2))
    );
    const nextAvailable = Number((params.currentAvailableBalance + params.payout).toFixed(2));
    const nextPnl = Number((params.currentTotalPnl + params.netPnl).toFixed(2));

    batch.update(doc(db, 'trades', params.trade.id), {
      status: 'SETTLED',
      result: params.result,
      exitPrice: params.exitPrice,
      payout: params.payout,
      netPnl: params.netPnl,
      settlementSignature: params.settlementSignature.slice(0, 256),
      settledAt: serverTimestamp(),
    });

    batch.update(doc(db, 'users', params.trade.uid), {
      availableBalance: nextAvailable,
      tradingBalance: nextTrading,
      totalPnl: nextPnl,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export function subscribeUserTrades(
  uid: string,
  onData: (trades: FuturesTrade[]) => void
): Unsubscribe {
  const path = 'trades';
  const q = query(collection(db, 'trades'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as FuturesTrade);
      list.sort((a, b) => b.startedAtMs - a.startedAtMs);
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// --- KYC Verification ---

export async function submitKycApplication(params: {
  uid: string;
  email: string;
  fullName: string;
  documentType: DocumentType;
  documentNumber: string;
  country: string;
  sampleDocName: string;
}): Promise<void> {
  const submissionId = makeId('kyc');
  const path = `kycSubmissions/${submissionId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'kycSubmissions', submissionId), {
      id: submissionId,
      uid: params.uid,
      email: params.email.toLowerCase(),
      fullName: params.fullName.trim().slice(0, 120),
      documentType: params.documentType,
      documentNumber: params.documentNumber.trim().slice(0, 64),
      country: params.country.trim().slice(0, 64),
      sampleDocName: params.sampleDocName.trim().slice(0, 120),
      status: 'PENDING',
      reviewNote: '',
      reviewedBy: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'users', params.uid), {
      kycStatus: 'PENDING',
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeUserKycSubmissions(
  uid: string,
  onData: (items: KycSubmission[]) => void
): Unsubscribe {
  const path = 'kycSubmissions';
  const q = query(collection(db, 'kycSubmissions'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as KycSubmission);
      list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// --- Wallet & Transactions ---

export function subscribeWalletConfigs(
  onData: (configs: WalletAddressConfig[]) => void
): Unsubscribe {
  const path = 'walletConfigs';
  return onSnapshot(
    collection(db, 'walletConfigs'),
    (snap) => {
      if (snap.empty) {
        const fallback: WalletAddressConfig[] = DEFAULT_WALLET_CONFIGS.map((c) => ({
          ...c,
          updatedBy: 'system',
        }));
        onData(fallback);
        return;
      }
      onData(snap.docs.map((d) => d.data() as WalletAddressConfig));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createWalletRequest(params: {
  uid: string;
  email: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  asset: string;
  network: string;
  amount: number;
  address: string;
  txReference: string;
}): Promise<void> {
  const txId = makeId('tx');
  const path = `transactions/${txId}`;
  try {
    await setDoc(doc(db, 'transactions', txId), {
      id: txId,
      uid: params.uid,
      email: params.email.toLowerCase(),
      type: params.type,
      asset: params.asset.trim().slice(0, 16),
      network: params.network.trim().slice(0, 48),
      amount: Number(params.amount.toFixed(2)),
      address: params.address.trim().slice(0, 160),
      txReference: params.txReference.trim().slice(0, 160),
      status: 'PENDING',
      adminNote: '',
      reviewedBy: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export function subscribeUserTransactions(
  uid: string,
  onData: (txs: WalletTransaction[]) => void
): Unsubscribe {
  const path = 'transactions';
  const q = query(collection(db, 'transactions'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as WalletTransaction);
      list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// --- Customer Support Messaging ---

export async function createSupportTicket(params: {
  uid: string;
  email: string;
  username: string;
  subject: string;
  category: string;
  initialMessage: string;
}): Promise<string> {
  const ticketId = makeId('tkt');
  const messageId = makeId('msg');
  const path = `supportTickets/${ticketId}`;
  try {
    const batch = writeBatch(db);
    const body = params.initialMessage.trim().slice(0, 2000);
    batch.set(doc(db, 'supportTickets', ticketId), {
      id: ticketId,
      uid: params.uid,
      email: params.email.toLowerCase(),
      username: params.username.slice(0, 60),
      subject: params.subject.trim().slice(0, 140),
      category: params.category.trim().slice(0, 48),
      status: 'Open',
      lastMessagePreview: body.slice(0, 200),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'supportTickets', ticketId, 'messages', messageId), {
      id: messageId,
      ticketId,
      senderUid: params.uid,
      senderRole: 'customer',
      senderName: params.username.slice(0, 60),
      body,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return ticketId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function sendSupportMessage(params: {
  ticketId: string;
  senderUid: string;
  senderRole: 'customer' | 'admin';
  senderName: string;
  body: string;
  newStatus?: SupportStatus;
}): Promise<void> {
  const messageId = makeId('msg');
  const path = `supportTickets/${params.ticketId}/messages/${messageId}`;
  try {
    const batch = writeBatch(db);
    const cleanBody = params.body.trim().slice(0, 2000);
    batch.set(doc(db, 'supportTickets', params.ticketId, 'messages', messageId), {
      id: messageId,
      ticketId: params.ticketId,
      senderUid: params.senderUid,
      senderRole: params.senderRole,
      senderName: params.senderName.slice(0, 60),
      body: cleanBody,
      createdAt: serverTimestamp(),
    });

    const ticketUpdate: Record<string, unknown> = {
      lastMessagePreview: cleanBody.slice(0, 200),
      updatedAt: serverTimestamp(),
    };
    if (params.senderRole === 'admin' && params.newStatus) {
      ticketUpdate.status = params.newStatus;
    }
    batch.update(doc(db, 'supportTickets', params.ticketId), ticketUpdate);
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export function subscribeUserSupportTickets(
  uid: string,
  onData: (tickets: SupportTicket[]) => void
): Unsubscribe {
  const path = 'supportTickets';
  const q = query(collection(db, 'supportTickets'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as SupportTicket);
      list.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeTicketMessages(
  ticketId: string,
  onData: (messages: SupportMessage[]) => void
): Unsubscribe {
  const path = `supportTickets/${ticketId}/messages`;
  const q = query(
    collection(db, 'supportTickets', ticketId, 'messages'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as SupportMessage));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// --- Admin Operations ---

export async function seedDefaultWalletConfigsIfEmpty(adminEmail: string): Promise<void> {
  const path = 'walletConfigs';
  try {
    const snap = await getDocs(collection(db, 'walletConfigs'));
    if (!snap.empty) return;
    const batch = writeBatch(db);
    for (const cfg of DEFAULT_WALLET_CONFIGS) {
      batch.set(doc(db, 'walletConfigs', cfg.id), {
        ...cfg,
        updatedBy: adminEmail,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeAdminAllUsers(onData: (users: UserProfile[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'users'), orderBy('createdAt', 'desc')),
    (snap) => onData(snap.docs.map((d) => d.data() as UserProfile)),
    (error) => handleFirestoreError(error, OperationType.LIST, 'users')
  );
}

export function subscribeAdminAllTrades(onData: (trades: FuturesTrade[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'trades'), orderBy('startedAtMs', 'desc')),
    (snap) => onData(snap.docs.map((d) => d.data() as FuturesTrade)),
    (error) => handleFirestoreError(error, OperationType.LIST, 'trades')
  );
}

export function subscribeAdminTradeConfigs(
  onData: (configs: Record<string, AdminTradeConfig>) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'adminTradeConfigs'),
    (snap) => {
      const map: Record<string, AdminTradeConfig> = {};
      for (const d of snap.docs) {
        map[d.id] = d.data() as AdminTradeConfig;
      }
      onData(map);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'adminTradeConfigs')
  );
}

export function subscribeAdminKycQueue(onData: (items: KycSubmission[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'kycSubmissions'), orderBy('createdAt', 'desc')),
    (snap) => onData(snap.docs.map((d) => d.data() as KycSubmission)),
    (error) => handleFirestoreError(error, OperationType.LIST, 'kycSubmissions')
  );
}

export function subscribeAdminTransactions(
  onData: (txs: WalletTransaction[]) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'transactions'), orderBy('createdAt', 'desc')),
    (snap) => onData(snap.docs.map((d) => d.data() as WalletTransaction)),
    (error) => handleFirestoreError(error, OperationType.LIST, 'transactions')
  );
}

export function subscribeAdminSupportTickets(
  onData: (tickets: SupportTicket[]) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'supportTickets'), orderBy('updatedAt', 'desc')),
    (snap) => onData(snap.docs.map((d) => d.data() as SupportTicket)),
    (error) => handleFirestoreError(error, OperationType.LIST, 'supportTickets')
  );
}

export function subscribeAuditLogs(onData: (logs: AuditLog[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc')),
    (snap) => onData(snap.docs.map((d) => d.data() as AuditLog)),
    (error) => handleFirestoreError(error, OperationType.LIST, 'auditLogs')
  );
}

export async function adminAdjustUserBalance(params: {
  adminUid: string;
  adminEmail: string;
  targetUser: UserProfile;
  newAvailableBalance: number;
  newTradingBalance: number;
  reason: string;
}): Promise<void> {
  const path = `users/${params.targetUser.uid}`;
  const logId = makeId('aud');
  const txId = makeId('tx');
  try {
    const batch = writeBatch(db);
    const delta = Number(
      (params.newAvailableBalance - params.targetUser.availableBalance).toFixed(2)
    );
    batch.update(doc(db, 'users', params.targetUser.uid), {
      availableBalance: Number(params.newAvailableBalance.toFixed(2)),
      tradingBalance: Number(params.newTradingBalance.toFixed(2)),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'transactions', txId), {
      id: txId,
      uid: params.targetUser.uid,
      email: params.targetUser.email,
      type: 'ADMIN_ADJUSTMENT',
      asset: 'USD',
      network: 'Internal Demo Ledger',
      amount: Math.max(0.01, Math.abs(delta) || params.newAvailableBalance),
      address: params.targetUser.accountId,
      txReference: `ADJ_${txId}`,
      status: 'APPROVED',
      adminNote: params.reason.trim().slice(0, 300) || 'Admin balance adjustment',
      reviewedBy: params.adminEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'auditLogs', logId), {
      id: logId,
      adminUid: params.adminUid,
      adminEmail: params.adminEmail,
      action: 'BALANCE_ADJUSTMENT',
      targetUid: params.targetUser.uid,
      targetId: params.targetUser.accountId,
      details: `Updated ${params.targetUser.email} availableBalance from $${params.targetUser.availableBalance.toFixed(2)} to $${params.newAvailableBalance.toFixed(2)} and tradingBalance to $${params.newTradingBalance.toFixed(2)}. Reason: ${params.reason}`,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminReviewKyc(params: {
  adminUid: string;
  adminEmail: string;
  submission: KycSubmission;
  decision: 'APPROVED' | 'REJECTED';
  reviewNote: string;
}): Promise<void> {
  const path = `kycSubmissions/${params.submission.id}`;
  const logId = makeId('aud');
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'kycSubmissions', params.submission.id), {
      status: params.decision,
      reviewNote: params.reviewNote.trim().slice(0, 300),
      reviewedBy: params.adminEmail,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users', params.submission.uid), {
      kycStatus: params.decision,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'auditLogs', logId), {
      id: logId,
      adminUid: params.adminUid,
      adminEmail: params.adminEmail,
      action: `KYC_${params.decision}`,
      targetUid: params.submission.uid,
      targetId: params.submission.id,
      details: `KYC ${params.decision} for ${params.submission.email} (${params.submission.documentType}). Note: ${params.reviewNote || 'None'}`,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminReviewWalletTransaction(params: {
  adminUid: string;
  adminEmail: string;
  tx: WalletTransaction;
  targetUserBalance: number;
  decision: 'APPROVED' | 'REJECTED';
  adminNote: string;
}): Promise<void> {
  const path = `transactions/${params.tx.id}`;
  const logId = makeId('aud');
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'transactions', params.tx.id), {
      status: params.decision,
      adminNote: params.adminNote.trim().slice(0, 300),
      reviewedBy: params.adminEmail,
      updatedAt: serverTimestamp(),
    });

    if (params.decision === 'APPROVED') {
      const nextBalance =
        params.tx.type === 'DEPOSIT'
          ? Number((params.targetUserBalance + params.tx.amount).toFixed(2))
          : Math.max(0, Number((params.targetUserBalance - params.tx.amount).toFixed(2)));
      batch.update(doc(db, 'users', params.tx.uid), {
        availableBalance: nextBalance,
        updatedAt: serverTimestamp(),
      });
    }

    batch.set(doc(db, 'auditLogs', logId), {
      id: logId,
      adminUid: params.adminUid,
      adminEmail: params.adminEmail,
      action: `${params.tx.type}_${params.decision}`,
      targetUid: params.tx.uid,
      targetId: params.tx.id,
      details: `${params.tx.type} of $${params.tx.amount.toFixed(2)} (${params.tx.asset} on ${params.tx.network}) ${params.decision} for ${params.tx.email}. Note: ${params.adminNote || 'None'}`,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminSaveTradeConfigAndAudit(params: {
  adminUid: string;
  adminEmail: string;
  trade: FuturesTrade;
  outcome: 'AUTO' | 'WIN' | 'LOSE';
  locked: boolean;
}): Promise<void> {
  const path = `adminTradeConfigs/${params.trade.id}`;
  const logId = makeId('aud');
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'adminTradeConfigs', params.trade.id), {
      tradeId: params.trade.id,
      configuredOutcome: params.outcome,
      locked: params.locked,
      configuredBy: params.adminEmail,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'auditLogs', logId), {
      id: logId,
      adminUid: params.adminUid,
      adminEmail: params.adminEmail,
      action: params.locked ? 'TRADE_OUTCOME_LOCKED' : 'TRADE_OUTCOME_CONFIGURED',
      targetUid: params.trade.uid,
      targetId: params.trade.id,
      details: `Set ${params.trade.symbol} ${params.trade.direction} ($${params.trade.amount}) outcome to ${params.outcome} (locked=${params.locked}) for ${params.trade.userEmail}`,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function adminSaveWalletConfig(params: {
  adminUid: string;
  adminEmail: string;
  config: Omit<WalletAddressConfig, 'updatedBy' | 'updatedAt'>;
}): Promise<void> {
  const path = `walletConfigs/${params.config.id}`;
  const logId = makeId('aud');
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'walletConfigs', params.config.id), {
      ...params.config,
      updatedBy: params.adminEmail,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'auditLogs', logId), {
      id: logId,
      adminUid: params.adminUid,
      adminEmail: params.adminEmail,
      action: 'WALLET_CONFIG_UPDATED',
      targetUid: params.adminUid,
      targetId: params.config.id,
      details: `Updated sample ${params.config.asset} (${params.config.network}) deposit address & QR payload. Active=${params.config.isActive}`,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function adminDeleteWalletConfig(params: {
  adminUid: string;
  adminEmail: string;
  configId: string;
}): Promise<void> {
  const path = `walletConfigs/${params.configId}`;
  try {
    await deleteDoc(doc(db, 'walletConfigs', params.configId));
    const logId = makeId('aud');
    await setDoc(doc(db, 'auditLogs', logId), {
      id: logId,
      adminUid: params.adminUid,
      adminEmail: params.adminEmail,
      action: 'WALLET_CONFIG_DELETED',
      targetUid: params.adminUid,
      targetId: params.configId,
      details: `Removed wallet address config ${params.configId}`,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function adminUpdateTicketStatus(params: {
  adminUid: string;
  adminEmail: string;
  ticket: SupportTicket;
  status: SupportStatus;
}): Promise<void> {
  const path = `supportTickets/${params.ticket.id}`;
  const logId = makeId('aud');
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'supportTickets', params.ticket.id), {
      status: params.status,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'auditLogs', logId), {
      id: logId,
      adminUid: params.adminUid,
      adminEmail: params.adminEmail,
      action: 'SUPPORT_STATUS_UPDATED',
      targetUid: params.ticket.uid,
      targetId: params.ticket.id,
      details: `Changed support ticket "${params.ticket.subject}" status to ${params.status}`,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminUpdateUserRole(params: {
  adminUid: string;
  adminEmail: string;
  targetUser: UserProfile;
  role: 'customer' | 'admin';
}): Promise<void> {
  const path = `users/${params.targetUser.uid}`;
  const logId = makeId('aud');
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', params.targetUser.uid), {
      role: params.role,
      updatedAt: serverTimestamp(),
    });
    if (params.role === 'admin') {
      batch.set(doc(db, 'admins', params.targetUser.uid), {
        uid: params.targetUser.uid,
        email: params.targetUser.email,
        grantedBy: params.adminUid,
        createdAt: serverTimestamp(),
      });
    } else if (params.targetUser.uid !== params.adminUid) {
      batch.delete(doc(db, 'admins', params.targetUser.uid));
    }
    batch.set(doc(db, 'auditLogs', logId), {
      id: logId,
      adminUid: params.adminUid,
      adminEmail: params.adminEmail,
      action: 'USER_ROLE_CHANGED',
      targetUid: params.targetUser.uid,
      targetId: params.targetUser.accountId,
      details: `Updated role for ${params.targetUser.email} to ${params.role}`,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}
