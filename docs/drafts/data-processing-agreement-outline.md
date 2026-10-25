# Data processing agreement: outline

> **Draft for review by the hospital and its legal adviser. Not legal advice.**
>
> Written by DevMSR on 2026-10-25. This is an outline of headings and points for the hospital's legal adviser to turn into an agreement between DevMSR and the hospital. It is not the agreement. Commercial terms (fees, liability caps, insurance) are left to the parties. Points to settle are marked "To agree" (between the parties) or "Legal" (for the legal adviser). Stage 8 of `docs/go-live-checklist.md` tracks it.

## 1. Parties

- [Hospital legal name], [address], [registration details]: "the Hospital".
- [DevMSR legal entity, to confirm: company, LLP or proprietorship], [address]: "DevMSR".
- Signatories for each (question MD-9 in `docs/hospital-questions.md`).

## 2. Background

- DevMSR provides and runs DevMSR HMS, a hospital management system, for the Hospital under a separate service agreement. **To agree:** whether this agreement is a schedule to that agreement or stands alone.
- This agreement covers the personal data DevMSR handles while doing so.

## 3. Definitions

- Use the terms of the Digital Personal Data Protection Act, 2023 and its rules: personal data, data principal, data fiduciary, data processor, personal data breach, consent manager. **Legal:** confirm the definitions and whether "sensitive" health data has any extra meaning under other laws that apply.
- Also define: the System, Production, Staging, Hospital Data, Sub-processor, Break-glass Access, Backup.

## 4. Roles

- The Hospital is the data fiduciary for patient and staff data in the System. DevMSR is the data processor. **Legal:** confirm (question E-1 in `docs/drafts/privacy-notice-and-consent.md`).
- DevMSR is the data fiduciary only for its own business data, such as the Hospital's contact people and invoices to the Hospital.
- The Hospital is responsible for having a lawful basis, giving notices and taking consents (`docs/drafts/privacy-notice-and-consent.md`).

## 5. What DevMSR processes, and why

- **Purpose:** to host, run, maintain, back up, secure and support the System for the Hospital, and nothing else.
- **Data principals:** patients, their guardians and emergency contacts, and the Hospital's staff who use the System.
- **Data:** as listed in Part A of `docs/drafts/privacy-notice-and-consent.md`, plus staff names, usernames, password hashes (Argon2id, never the password), login history and the audit log.
- **Not allowed:** selling data, using it for advertising or for DevMSR's other customers, building analytics on it outside the Hospital's own reports, or training any model on it. **To agree:** whether DevMSR may use anonymised, aggregated figures (for example "number of bills per day") to improve the product, and how anonymisation is checked.

## 6. Instructions

- DevMSR acts only on the Hospital's documented instructions. This agreement, the service agreement and written requests from named Hospital contacts are the instructions.
- DevMSR tells the Hospital if it believes an instruction breaks the law.
- **To agree:** the Hospital contacts allowed to give instructions, and how (for example email from named addresses only).

## 7. DevMSR's people

- Only named DevMSR people have production access. **To agree:** how they are named and how the Hospital is told of changes.
- Each signs a confidentiality undertaking that survives the end of their work.
- They work on production data only to keep the System running or to fix a fault, and use made-up data for development and testing. The System's rules already forbid real patient data outside production (`CLAUDE.md` section 7).
- **Break-glass access** to patient records through the app: a written reason, expiry after 1 hour, an audit event and a notice to the Hospital admin. **Not built yet** (stage 4 of the checklist).
- **Direct database access** (outside the app) for emergency fixes: **To agree:** whether allowed, who approves it, and how it is logged and reported to the Hospital.

## 8. Security measures

List them in an annex so it can be updated without re-signing. From what the System does today and the go-live checklist:

| Area | Measure | Status |
| --- | --- | --- |
| Access | Role-based permissions checked on every request; maker-checker for discounts, refunds, voids and overrides; a record from another hospital is reported as not found | Built |
| Sign-in | Argon2id passwords; lockout for 15 minutes after 5 failures; server-side sessions with a 15 minute idle limit and a 12 hour maximum; CSRF protection; rate limits | Built |
| Two-factor login | For super admin, hospital admin and finance roles | Before go-live |
| Audit | Audit events for every financial change and every patient record view; database triggers stop them being changed or deleted | Built |
| Audit, database role | The API runs as a database user that cannot change audit rows | Before go-live |
| Encryption in transit | HTTPS everywhere, HSTS, Cloudflare in front | Before go-live (production) |
| Field encryption | Aadhaar and ABHA numbers encrypted with AES-256-GCM, shown masked | Built |
| Backups | Daily database backups plus an encrypted copy in a separate account; a quarterly restore drill | Before go-live |
| Logs | Patient fields removed from logs; logs kept 180 days in India | Partly built |
| Server | Containers run as non-root; only ports 80 and 443 open; SSH by key only; database reachable only from the server | Before go-live |
| Testing | Independent VAPT by a CERT-In empanelled auditor, all high and critical findings fixed before real patients | Before go-live |
| Supply chain | Lockfile, dependency audit in CI, new dependencies only with approval | Built |

- **To agree:** how often the annex is reviewed, and whether the Hospital may ask for evidence (for example the VAPT report summary or the latest restore drill record).

## 9. Sub-processors

DevMSR uses other companies to run the System. Each must be named, with what it handles and where.

| Sub-processor | What it does | Data it handles | Location |
| --- | --- | --- | --- |
| [Hosting provider, to choose] | Runs the web app and API | All, in memory and on disk | India, to confirm |
| Supabase | PostgreSQL database | All stored data | Mumbai region planned; to confirm |
| Cloudflare | Proxy and DNS; R2 for files and backups | All traffic passes through; files and backups stored | To confirm (question MD-7) |
| Sentry | Error reports | Technical details with patient data removed | To confirm |
| Resend (or another email provider) | Sends emailed bills | Patient email address, bill as a password-protected PDF | To confirm |
| Later: WhatsApp and SMS providers, Razorpay, ABDM | Messages, payment links, health records | Phone numbers, message text, payment details | Phases 2 and 3 |

- DevMSR has written terms with each sub-processor at least as protective as this agreement. **Legal:** confirm whether the providers' standard terms are enough.
- **To agree:** how much notice DevMSR gives before adding or changing a sub-processor, and whether the Hospital may object.

## 10. Where data is stored

- All Hospital Data stays in India, including backups and logs, unless the Hospital agrees in writing to an exception. **To agree** after question MD-7.
- **Legal:** whether any law requires data to stay in India, and whether any transfer outside India is restricted by the Central Government under the DPDP Act.

## 11. Personal data breaches

- DevMSR tells the Hospital of any personal data breach **within [hours, to agree]** of noticing it, with what is known, and updates as it learns more.
- DevMSR helps the Hospital meet its own duties: the report to CERT-In within 6 hours (as we understand the CERT-In directions of 28 April 2022), and the notices to the Data Protection Board and to affected patients. See `docs/drafts/incident-response-plan.md`.
- **Legal:** whether DevMSR also has its own duty to report to CERT-In for incidents on systems it runs, and how to avoid two conflicting reports.
- DevMSR keeps the logs and audit records needed for investigation (180 days for logs, as CERT-In expects), and gives the Hospital access to them for an investigation.

## 12. Helping with patients' rights

- DevMSR helps the Hospital answer requests to see, correct or erase data (Part D of `docs/drafts/privacy-notice-and-consent.md`), within [days, to agree].
- Until a self-service export exists, DevMSR prepares a patient's data on the Hospital's written request.
- DevMSR does not answer patients directly; it passes any request it receives to the Hospital.

## 13. Records, audits and reviews

- DevMSR keeps a record of what it processes for the Hospital and how.
- The Hospital may audit DevMSR's compliance once a year, or after a breach, with [notice period, to agree]. An independent report (for example the VAPT report) may stand in for an on-site audit. **To agree.**
- **Legal:** whether the Hospital must carry out a data protection impact assessment or periodic audit itself (for example if it is notified as a significant data fiduciary), and what DevMSR must provide for it.

## 14. Availability, backup and recovery

- **To agree:** service hours, support contacts and response times; planned maintenance windows and notice.
- Backup frequency and how much data may be lost, and how fast service must be restored, come from questions MD-3 and MD-4 in `docs/hospital-questions.md`.
- DevMSR runs and records a restore drill every quarter, and shares the result with the Hospital.
- DevMSR publishes its backup, recovery and security practices (a commitment in `CLAUDE.md` section 1).

## 15. Retention, return and deletion

- During the agreement, data is kept as the Hospital decides (question MD-5). The System never hard deletes clinical or financial records.
- **When the agreement ends:**
  - DevMSR gives the Hospital a complete export of its data. **To agree:** the format (for example a PostgreSQL dump plus readable CSV files and the stored PDFs), and how long DevMSR has to deliver it.
  - The Hospital confirms it has received and checked the export.
  - DevMSR then deletes the Hospital's data from production, staging (which should hold none), file storage and backups, within [period, to agree], and confirms in writing. Backups that cannot be deleted early are kept encrypted until they expire and are never restored except at the Hospital's request.
  - Field encryption keys for the Hospital are destroyed last, after the export is confirmed. Without them the encrypted Aadhaar and ABHA numbers cannot be read, so the export must include them in readable form or the Hospital must agree otherwise. **To agree.**
- **Legal:** whether any law requires DevMSR, rather than the Hospital, to keep anything after the end.

## 16. Liability, indemnity and insurance

- **Legal and to agree:** liability for breaches of this agreement, any cap, indemnities, and whether DevMSR must hold cyber insurance.

## 17. Term and termination

- Starts on signing, before any real patient data enters the System.
- Lasts as long as DevMSR processes Hospital Data, including during the hand-back in section 15.
- **To agree:** termination for breach, and what happens if DevMSR stops trading (for example an escrow of the source code and access to the backups).

## 18. Law and disputes

- **Legal:** governing law (India), courts or arbitration, and the seat.

## 19. Annexes

1. Data and data principals (from Part A of the privacy notice).
2. Security measures (section 8 table).
3. Sub-processors (section 9 table).
4. Contacts: the Hospital's instruction givers, DevMSR's named people, incident contacts (from the incident response plan).
5. Service levels and support (section 14).
6. The export format at the end of the agreement (section 15).

## Open points

For the parties to agree: everything marked "To agree" above, especially the breach notice time (section 11), sub-processor notice (section 9), direct database access (section 7), the end-of-contract export and deletion periods (section 15), and service levels (section 14).

For the legal adviser: everything marked "Legal" above, especially the roles (section 4), data location (section 10), who reports to CERT-In (section 11), and liability (section 16).

For DevMSR: confirm the legal entity that signs; confirm where each sub-processor stores data; build break-glass access and a patient data export.
