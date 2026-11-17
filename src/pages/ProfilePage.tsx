import {
  CheckCircle2,
  Clock,
  FileCheck2,
  LogOut,
  MessageSquare,
  Send,
  Settings,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatTimestamp } from '../lib/format';
import {
  createSupportTicket,
  sendSupportMessage,
  submitKycApplication,
  subscribeTicketMessages,
  subscribeUserKycSubmissions,
  subscribeUserSupportTickets,
  updateUserPreferences,
} from '../services/firestoreService';
import type {
  DocumentType,
  KycSubmission,
  SupportMessage,
  SupportTicket,
  UserProfile,
} from '../types/exchange';

interface ProfilePageProps {
  profile: UserProfile;
}

export function ProfilePage({ profile }: ProfilePageProps) {
  const { logout } = useAuth();
  const [section, setSection] = useState<'overview' | 'kyc' | 'support' | 'settings'>(
    'overview'
  );

  // Account Settings State
  const [usernameInput, setUsernameInput] = useState(profile.username);
  const [confirmTrades, setConfirmTrades] = useState(profile.settings.confirmTrades);
  const [compactMode, setCompactMode] = useState(profile.settings.compactMode);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // KYC State
  const [kycHistory, setKycHistory] = useState<KycSubmission[]>([]);
  const [fullName, setFullName] = useState(profile.username);
  const [docType, setDocType] = useState<DocumentType>('PASSPORT');
  const [docNumber, setDocNumber] = useState('');
  const [country, setCountry] = useState('United States');
  const [sampleDocName, setSampleDocName] = useState('sample_passport_front.pdf');
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycFeedback, setKycFeedback] = useState<string | null>(null);

  // Support Chat State
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newSubject, setNewSubject] = useState('');
  const [newCategory, setNewCategory] = useState('Account & KYC');
  const [newTicketMsg, setNewTicketMsg] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);

  useEffect(() => {
    const unsubKyc = subscribeUserKycSubmissions(profile.uid, setKycHistory);
    const unsubTickets = subscribeUserSupportTickets(profile.uid, (list) => {
      setTickets(list);
      if (list.length > 0 && !activeTicketId) {
        setActiveTicketId(list[0].id);
      }
    });
    return () => {
      unsubKyc();
      unsubTickets();
    };
  }, [profile.uid]);

  useEffect(() => {
    if (!activeTicketId) {
      setMessages([]);
      return;
    }
    const unsub = subscribeTicketMessages(activeTicketId, setMessages);
    return () => unsub();
  }, [activeTicketId]);

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSettingsMsg(null);
    setSavingSettings(true);
    try {
      await updateUserPreferences(profile.uid, {
        username: usernameInput,
        settings: {
          currency: 'USD',
          compactMode,
          confirmTrades,
        },
      });
      setSettingsMsg('Account settings saved.');
    } catch (err) {
      setSettingsMsg(err instanceof Error ? err.message : 'Unable to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSubmitKyc = async (e: FormEvent) => {
    e.preventDefault();
    setKycFeedback(null);
    if (fullName.trim().length < 2 || docNumber.trim().length < 4) {
      setKycFeedback('Please complete full legal name and sample document number.');
      return;
    }
    setKycSubmitting(true);
    try {
      await submitKycApplication({
        uid: profile.uid,
        email: profile.email,
        fullName,
        documentType: docType,
        documentNumber: docNumber,
        country,
        sampleDocName,
      });
      setDocNumber('');
      setKycFeedback('Sample KYC application submitted and queued for admin approval.');
    } catch (err) {
      setKycFeedback(err instanceof Error ? err.message : 'KYC submission failed');
    } finally {
      setKycSubmitting(false);
    }
  };

  const handleCreateTicket = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newTicketMsg.trim()) return;
    setCreatingTicket(true);
    try {
      const id = await createSupportTicket({
        uid: profile.uid,
        email: profile.email,
        username: profile.username,
        subject: newSubject,
        category: newCategory,
        initialMessage: newTicketMsg,
      });
      setNewSubject('');
      setNewTicketMsg('');
      setActiveTicketId(id);
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleSendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeTicketId || !replyBody.trim()) return;
    const body = replyBody.trim();
    setReplyBody('');
    await sendSupportMessage({
      ticketId: activeTicketId,
      senderUid: profile.uid,
      senderRole: 'customer',
      senderName: profile.username,
      body,
    });
  };

  const activeTicket = tickets.find((t) => t.id === activeTicketId) || null;

  return (
    <div className="space-y-6">
      {/* User Identity Card */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 sm:p-7 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          {profile.photoURL ? (
            <img
              src={profile.photoURL}
              alt={profile.username}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-2xl object-cover border border-white/10 shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-xl font-display font-bold text-white shrink-0">
              {profile.username.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div className="space-y-1 min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-semibold text-white truncate">
              {profile.username}
            </h1>
            <p className="text-xs sm:text-sm font-mono text-slate-300 truncate">
              {profile.email}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-mono">ID: {profile.accountId}</span>
              <span aria-hidden="true">·</span>
              <span>Joined {formatTimestamp(profile.createdAt)}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  profile.kycStatus === 'APPROVED'
                    ? 'text-emerald-400 font-medium'
                    : profile.kycStatus === 'PENDING'
                    ? 'text-amber-400 font-medium'
                    : 'text-rose-400 font-medium'
                }
              >
                KYC: {profile.kycStatus.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => void logout()}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-white/12 bg-white/[0.04] hover:bg-rose-500/15 hover:border-rose-500/35 text-xs sm:text-sm font-medium text-slate-200 hover:text-rose-200 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </section>

      {/* Section Switcher */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#0B1120] border border-white/[0.08] w-fit">
        {[
          { id: 'overview', label: 'Account Overview' },
          { id: 'kyc', label: 'KYC Verification' },
          { id: 'support', label: 'Customer Support' },
          { id: 'settings', label: 'Account Settings' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSection(tab.id as typeof section)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              section === tab.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {section === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 space-y-4">
            <h2 className="font-display text-base font-semibold text-white">
              Account Identity
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4 py-2 border-b border-white/[0.06]">
                <dt className="text-slate-400">Username</dt>
                <dd className="font-medium text-white">{profile.username}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-white/[0.06]">
                <dt className="text-slate-400">Gmail Address</dt>
                <dd className="font-mono text-slate-200">{profile.email}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-white/[0.06]">
                <dt className="text-slate-400">Account ID</dt>
                <dd className="font-mono text-slate-200">{profile.accountId}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2 border-b border-white/[0.06]">
                <dt className="text-slate-400">Registration Date</dt>
                <dd className="text-slate-200">{formatTimestamp(profile.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-slate-400">Account Tier</dt>
                <dd className="font-mono text-blue-400">
                  Demo Exchange Account
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-white">
                KYC &amp; Support Quick Actions
              </h2>
              <FileCheck2 className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Demo futures trading unlocks automatically once an administrator reviews and approves your sample KYC submission.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSection('kyc')}
                className="p-4 rounded-xl bg-[#060913] border border-white/[0.08] hover:border-blue-500/40 text-left space-y-1 transition-colors cursor-pointer"
              >
                <p className="text-xs font-medium text-blue-400">KYC Verification</p>
                <p className="text-sm font-semibold text-white">
                  {profile.kycStatus.replace('_', ' ')}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSection('support')}
                className="p-4 rounded-xl bg-[#060913] border border-white/[0.08] hover:border-blue-500/40 text-left space-y-1 transition-colors cursor-pointer"
              >
                <p className="text-xs font-medium text-indigo-400">Customer Support</p>
                <p className="text-sm font-semibold text-white">
                  {tickets.length} Active {tickets.length === 1 ? 'Thread' : 'Threads'}
                </p>
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Demo KYC Verification */}
      {section === 'kyc' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-7 rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-white">
                  Demo KYC Verification
                </h2>
                <p className="text-xs text-slate-400">
                  Submit sample identity documentation only (prepared for compliant third-party KYC provider adapter)
                </p>
              </div>
              <span
                className={`text-xs font-mono font-semibold flex items-center gap-1.5 ${
                  profile.kycStatus === 'APPROVED'
                    ? 'text-emerald-400'
                    : profile.kycStatus === 'PENDING'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {profile.kycStatus === 'APPROVED' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : profile.kycStatus === 'PENDING' ? (
                  <Clock className="w-4 h-4" />
                ) : (
                  <ShieldAlert className="w-4 h-4" />
                )}
                <span>{profile.kycStatus.replace('_', ' ')}</span>
              </span>
            </div>

            {profile.kycStatus === 'APPROVED' ? (
              <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-sm text-emerald-200">
                Your demo KYC verification has been approved. Demo futures trading is enabled.
              </div>
            ) : profile.kycStatus === 'PENDING' ? (
              <div className="p-5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-sm text-amber-200">
                Your sample KYC submission is currently pending administrator review.
              </div>
            ) : (
              <form onSubmit={handleSubmitKyc} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="kyc-name" className="block text-xs font-medium text-slate-300">
                      Sample Full Legal Name
                    </label>
                    <input
                      id="kyc-name"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="kyc-country" className="block text-xs font-medium text-slate-300">
                      Issuing Country
                    </label>
                    <input
                      id="kyc-country"
                      type="text"
                      required
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="kyc-doctype" className="block text-xs font-medium text-slate-300">
                      Document Type
                    </label>
                    <select
                      id="kyc-doctype"
                      value={docType}
                      onChange={(e) => setDocType(e.target.value as DocumentType)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="NATIONAL_ID">National ID</option>
                      <option value="DRIVERS_LICENSE">Driver's License</option>
                      <option value="PASSPORT">Passport</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="kyc-docnum" className="block text-xs font-medium text-slate-300">
                      Sample Document Number
                    </label>
                    <input
                      id="kyc-docnum"
                      type="text"
                      required
                      minLength={4}
                      maxLength={64}
                      value={docNumber}
                      onChange={(e) => setDocNumber(e.target.value)}
                      placeholder="e.g. DEMO-PASS-88241"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="kyc-sample" className="block text-xs font-medium text-slate-300">
                    Sample Verification File Reference (Demo Only)
                  </label>
                  <select
                    id="kyc-sample"
                    value={sampleDocName}
                    onChange={(e) => setSampleDocName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm font-mono text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="sample_passport_front.pdf">sample_passport_front.pdf</option>
                    <option value="sample_national_id_verified.png">
                      sample_national_id_verified.png
                    </option>
                    <option value="sample_drivers_license_card.jpg">
                      sample_drivers_license_card.jpg
                    </option>
                  </select>
                </div>

                {kycFeedback && (
                  <p className="text-xs text-blue-300 bg-blue-500/10 border border-blue-500/25 rounded-xl p-3">
                    {kycFeedback}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={kycSubmitting}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-sm font-medium text-white cursor-pointer"
                >
                  {kycSubmitting ? 'Submitting Demo KYC...' : 'Submit Sample KYC Application'}
                </button>
              </form>
            )}
          </section>

          <section className="lg:col-span-5 rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 space-y-4">
            <h3 className="font-display text-base font-semibold text-white">
              KYC Submission History
            </h3>
            {kycHistory.length === 0 ? (
              <p className="text-xs text-slate-400">No KYC applications submitted yet.</p>
            ) : (
              <div className="space-y-3">
                {kycHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-[#060913] border border-white/[0.06] space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-white">
                        {item.documentType.replace('_', ' ')}
                      </span>
                      <span
                        className={`font-mono font-semibold ${
                          item.status === 'APPROVED'
                            ? 'text-emerald-400'
                            : item.status === 'REJECTED'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-slate-400">
                      {item.documentNumber} · {item.country}
                    </p>
                    {item.reviewNote && (
                      <p className="text-xs text-slate-300 pt-1">Note: {item.reviewNote}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-white/[0.08] text-xs text-slate-400 space-y-1">
              <p className="font-medium text-slate-300">
                Third-Party Compliance Provider Ready
              </p>
              <p>
                Structured for Sumsub / Persona / Onfido webhook verification adapters without storing raw PII documents in client storage.
              </p>
            </div>
          </section>
        </div>
      )}

      {/* Customer Support Messaging */}
      {section === 'support' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: New Ticket + Ticket List */}
          <section className="lg:col-span-5 space-y-4">
            <form
              onSubmit={handleCreateTicket}
              className="rounded-2xl border border-white/[0.08] bg-[#0B1120] p-5 space-y-3.5"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-white">
                  New Support Conversation
                </h2>
                <MessageSquare className="w-4 h-4 text-blue-400" />
              </div>
              <input
                type="text"
                required
                minLength={2}
                maxLength={140}
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Subject (e.g. Demo deposit verification)"
                className="w-full px-3.5 py-2 rounded-xl bg-[#060913] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#060913] border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="Account & KYC">Account &amp; KYC</option>
                <option value="Wallet & Transfers">Wallet &amp; Transfers</option>
                <option value="Futures Trading">Futures Trading</option>
                <option value="General Inquiry">General Inquiry</option>
              </select>
              <textarea
                rows={3}
                required
                maxLength={2000}
                value={newTicketMsg}
                onChange={(e) => setNewTicketMsg(e.target.value)}
                placeholder="Describe your question for our support team..."
                className="w-full px-3.5 py-2 rounded-xl bg-[#060913] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={creatingTicket}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs sm:text-sm font-medium text-white cursor-pointer"
              >
                {creatingTicket ? 'Opening Thread...' : 'Start Support Chat'}
              </button>
            </form>

            <div className="rounded-2xl border border-white/[0.08] bg-[#0B1120] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-white/[0.08]">
                <h3 className="text-sm font-semibold text-white">Your Conversations</h3>
              </div>
              {tickets.length === 0 ? (
                <p className="p-5 text-xs text-slate-400">No support conversations yet.</p>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {tickets.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTicketId(t.id)}
                      className={`w-full text-left p-4 transition-colors cursor-pointer ${
                        activeTicketId === t.id ? 'bg-blue-500/10' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-white truncate">{t.subject}</p>
                        <span
                          className={`text-xs font-mono shrink-0 ${
                            t.status === 'Resolved'
                              ? 'text-emerald-400'
                              : t.status === 'In Progress'
                              ? 'text-blue-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-1">
                        {t.lastMessagePreview}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Right: Live Message History */}
          <section className="lg:col-span-7 rounded-2xl border border-white/[0.08] bg-[#0B1120] flex flex-col h-[520px]">
            {!activeTicket ? (
              <div className="flex-1 flex items-center justify-center p-8 text-sm text-slate-400">
                Select a conversation or open a new support thread.
              </div>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">
                      {activeTicket.subject}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {activeTicket.category} · Status: {activeTicket.status}
                    </p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {messages.map((m) => {
                    const isCustomer = m.senderRole === 'customer';
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col max-w-[82%] ${
                          isCustomer ? 'ml-auto items-end' : 'mr-auto items-start'
                        }`}
                      >
                        <span className="text-[11px] text-slate-400 mb-1">
                          {m.senderName} · {isCustomer ? 'You' : 'Support Admin'}
                        </span>
                        <div
                          className={`px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                            isCustomer
                              ? 'bg-blue-600 text-white'
                              : 'bg-[#060913] border border-white/10 text-slate-100'
                          }`}
                        >
                          {m.body}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form
                  onSubmit={handleSendReply}
                  className="p-4 border-t border-white/[0.08] flex items-center gap-2.5"
                >
                  <input
                    type="text"
                    disabled={activeTicket.status === 'Resolved'}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder={
                      activeTicket.status === 'Resolved'
                        ? 'Conversation marked as Resolved'
                        : 'Write a message to support...'
                    }
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={activeTicket.status === 'Resolved' || !replyBody.trim()}
                    aria-label="Send support message"
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-45 text-white flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Send</span>
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}

      {/* Account Settings */}
      {section === 'settings' && (
        <section className="rounded-2xl border border-white/[0.08] bg-[#0B1120] p-6 max-w-xl space-y-5">
          <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3.5">
            <Settings className="w-4 h-4 text-blue-400" />
            <h2 className="font-display text-lg font-semibold text-white">Account Settings</h2>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="set-username" className="block text-xs font-medium text-slate-300">
                Display Username
              </label>
              <input
                id="set-username"
                type="text"
                minLength={2}
                maxLength={60}
                required
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#060913] border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
              <div>
                <p className="text-sm text-white font-medium">Order Confirmation Guard</p>
                <p className="text-xs text-slate-400">
                  Require explicit button press before submitting simulated trades
                </p>
              </div>
              <input
                type="checkbox"
                checked={confirmTrades}
                onChange={(e) => setConfirmTrades(e.target.checked)}
                className="rounded border-white/20 bg-[#060913] text-blue-600"
              />
            </label>

            <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
              <div>
                <p className="text-sm text-white font-medium">Compact Terminal Density</p>
                <p className="text-xs text-slate-400">
                  Optimize table spacing for high-density market scanning
                </p>
              </div>
              <input
                type="checkbox"
                checked={compactMode}
                onChange={(e) => setCompactMode(e.target.checked)}
                className="rounded border-white/20 bg-[#060913] text-blue-600"
              />
            </label>

            {settingsMsg && (
              <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 flex items-center gap-2">
                <XCircle className="w-3.5 h-3.5 hidden" />
                <span>{settingsMsg}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={savingSettings}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white cursor-pointer"
            >
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
