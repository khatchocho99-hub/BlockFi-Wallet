# Security Specification & Threat Model

## 1. Data Invariants
1. **Gmail-Only Verified Sessions**: Every authenticated write requires `request.auth != null`, `request.auth.token.email_verified == true`, and `request.auth.token.email.matches('.*@gmail\\.com$')`.
2. **PII Isolation**: User profile documents (`/users/{userId}`) contain email addresses and balances and are readable/listable ONLY by the owner (`request.auth.uid == userId`) or an authorized administrator (`isAdmin()`).
3. **Zero Self-Assigned Privileges**: A customer creating `/users/{userId}` MUST set `role == 'customer'`, `kycStatus == 'NOT_SUBMITTED'`, and cannot promote themselves to `admin` or approve their own KYC.
4. **KYC Gate on Futures Trading**: Creating a `/trades/{tradeId}` document requires the user's `/users/{uid}` document to have `kycStatus == 'APPROVED'`.
5. **Hidden Pre-Expiry Outcomes**: `/adminTradeConfigs/{tradeId}` is strictly restricted to `isAdmin()` for both read and write; customers cannot inspect pre-configured outcomes before trade expiry.
6. **Terminal State Locking**: Once a `/trades/{tradeId}` reaches `status == 'SETTLED'`, non-admin updates are permanently rejected to prevent duplicate settlements.
7. **Immutable Audit Trail**: `/auditLogs/{logId}` can only be created and read by `isAdmin()`; updates and deletes are unconditionally denied.
8. **Server Timestamps**: All `createdAt`, `updatedAt`, and `settledAt` fields must equal `request.time`.

## 2. Dirty Dozen Attack Payloads (Must Return PERMISSION_DENIED)
1. **Unverified Non-Gmail Spoof**: Authenticated user with `user@yahoo.com` or `email_verified: false` attempting `create` on `/users/{uid}`.
2. **Privilege Escalation on Registration**: Customer creating `/users/{uid}` with `role: 'admin'` or `kycStatus: 'APPROVED'`.
3. **Balance Inflation on Registration**: Customer creating `/users/{uid}` with `availableBalance: 9999999` (exceeding `10000`).
4. **Shadow Field Injection**: Customer updating `/users/{uid}` with extra field `isVip: true` (blocked by `hasOnly`).
5. **Self-KYC Approval**: Customer updating `/users/{uid}` changing `kycStatus` from `PENDING` to `APPROVED`.
6. **PII Blanket Read**: Customer A attempting `get` or `list` on `/users` or `/users/{customerB}`.
7. **Unapproved KYC Trade**: Customer with `kycStatus: 'PENDING'` attempting `create` on `/trades/{tradeId}`.
8. **Duplicate Trade Settlement**: Customer updating `/trades/{tradeId}` when `existing().status == 'SETTLED'`.
9. **Outcome Snooping**: Customer attempting `get` or `list` on `/adminTradeConfigs/{tradeId}`.
10. **Fake Deposit Auto-Approval**: Customer creating `/transactions/{txId}` with `status: 'APPROVED'`.
11. **Orphan Support Message Hijack**: Customer A posting to `/supportTickets/{ticketBelongingToB}/messages/{msgId}`.
12. **Audit Log Tampering**: Admin or customer attempting `update` or `delete` on `/auditLogs/{logId}`.
