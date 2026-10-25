# Incident response plan

> **Draft for review by the hospital and its legal adviser. Not legal advice.**
>
> Written by DevMSR on 2026-10-25 from what the system does today. Names, phone numbers and several legal points are still open; they are marked "To confirm" and collected at the end. Stage 8 of `docs/go-live-checklist.md` tracks it.

## 1. Purpose

This plan says who does what when something goes wrong with the security of DevMSR HMS: an account is misused, patient or billing data is seen or changed by someone who should not have it, the system is attacked, or data is lost. Its aims are to stop the harm quickly, keep evidence, meet reporting deadlines, and restore normal work safely.

When the system is simply down (no attack, no data exposed), follow `docs/drafts/downtime-procedure.md` instead. If a downtime turns out to have a security cause, switch to this plan.

## 2. What this plan covers

| Part | What it is | Who runs it |
| --- | --- | --- |
| Web app | The screens staff use, served from the `app.` domain | DevMSR |
| API | The server that applies every rule and talks to the database, on the `api.` domain | DevMSR |
| Database | PostgreSQL on Supabase (planned: Mumbai region) | DevMSR, on Supabase's platform |
| Files and backups | Cloudflare R2 (planned) | DevMSR |
| Server and network | A cloud server running Docker and Caddy, with Cloudflare in front | DevMSR, on the host's platform |
| Email | Emailed bills through the email provider (planned) | DevMSR |
| Counter computers, printers, Wi-Fi, the hospital's internet | The hospital's own equipment | Hospital |
| Staff accounts | Created, changed and deactivated by the hospital admin | Hospital |

## 3. What counts as an incident

Any event that harms, or could harm, the confidentiality, integrity or availability of the system or the data in it. For example:

- A staff password is shared, stolen or guessed, or someone uses another person's login.
- A patient's record is opened, printed or sent to someone who has no reason to see it.
- Bills, receipts, rates or users are changed in a way nobody can explain.
- Many failed logins, scanning or other signs of an attack.
- Malware or ransomware on a counter computer used for the system.
- The website is defaced, or a fake copy of it appears.
- A lost or stolen laptop or phone that was signed in, or that held exported data.
- Data leaked from the system, a backup, or one of its service providers.
- An attack that makes the system unavailable.

CERT-In's directions of 28 April 2022 (under section 70B(6) of the Information Technology Act, 2000) list types of cyber incident that must be reported. **To confirm with the legal adviser:** which of those types apply to the hospital and to DevMSR, using the current list on the CERT-In website.

If in doubt, treat it as an incident and tell the incident lead. A false alarm costs little; a late report can cost a lot.

## 4. Roles

Each role needs a named person and a deputy before go-live. One person may hold more than one role.

| Role | Who | Deputy | Phone | Job |
| --- | --- | --- | --- | --- |
| Hospital incident lead | To confirm (question MD-8) | | | Runs the response for the hospital, decides on containment that affects patient care, keeps the incident log |
| DevMSR technical lead | The DevMSR developer | To confirm | | Investigates the system, contains technical damage, preserves logs, restores service |
| Decision maker | The MD or owner | | | Approves reports to authorities and notices to patients, and anything that stops hospital work |
| CERT-In point of contact | To confirm | | | Sends the report to CERT-In and answers its follow-up questions |
| Communications | To confirm | | | Speaks to staff, patients and the media. Nobody else speaks outside the hospital |
| Legal adviser | To confirm (question MD-9) | | | Advises on reporting duties, notices and evidence |
| Hospital admin | The hospital admin | | | Deactivates accounts, resets passwords, checks the user list |

**To confirm with the legal adviser:** whether the hospital, DevMSR or both must report a given incident to CERT-In, and whether each must name its own point of contact with CERT-In.

## 5. Severity

| Level | Meaning | Examples | Who is called |
| --- | --- | --- | --- |
| 1, critical | Patient or financial data exposed or changed, or the system under active attack | Leaked database or backup, a stolen admin account, ransomware | Everyone in section 4, at once, any hour |
| 2, high | A real risk, but no sign yet that data left or changed | One staff account misused, a burst of failed logins, a lost signed-in device | Incident lead and DevMSR technical lead, within the hour |
| 3, low | Suspicious but contained | A phishing email that nobody clicked, a password written on a sticky note | Incident lead, the same working day |

The incident lead may raise or lower the level as facts come in. These levels are a starting point for the hospital to adjust.

## 6. What to do

All times are counted from when the incident was first noticed. Write every step in the incident log (section 9), with the time in IST.

### Anyone who notices something

1. Do not try to investigate or fix it yourself. Do not switch off or wipe a computer that may be infected; unplug it from the network instead.
2. Tell the hospital incident lead at once, by phone. If you cannot reach them, call the deputy, then the DevMSR technical lead.
3. Write down what you saw, when, on which computer, and under whose login.

### First hour: contain

The incident lead and the DevMSR technical lead agree on which steps apply.

- **A staff account is misused.** The hospital admin deactivates the account in Settings, then Users. Deactivating ends every session of that user at once, and so does setting a new password. Both are recorded in the audit log.
- **Many accounts may be affected.** DevMSR ends all sessions so everyone signs in again. **To confirm with DevMSR:** a single action to end every session for the hospital does not exist yet; until it does, this is done by the developer directly on the database, and recorded in the incident log.
- **An attack from outside.** DevMSR blocks the source at Cloudflare, tightens rate limits, or takes the system offline. Taking it offline stops hospital work, so the decision maker agrees first unless data is leaving right now; then the hospital switches to the downtime procedure.
- **A secret may have leaked** (a database password, a storage key, the session secret, the field encryption key). DevMSR replaces it and restarts the services. Replacing the field encryption key needs every Aadhaar and ABHA number re-encrypted: the stored format allows a new key version, but a tool to re-encrypt does not exist yet, so plan this before go-live.
- **A counter computer is infected.** Unplug it from the network and do not use it for the system until it has been cleaned or rebuilt. Change the passwords of everyone who used it.

### Within 6 hours: report to CERT-In

As we understand the CERT-In directions of 28 April 2022, reportable cyber incidents must be reported to CERT-In within 6 hours of being noticed or brought to notice.

- The CERT-In point of contact sends the report, using the format and contact details on the CERT-In website on the day (at the time of writing, incident reports go to `incident@cert-in.org.in`; check before relying on it).
- Send what is known within 6 hours, even if the investigation is not finished. Send updates as more is learnt.
- Record what was sent, to whom and when.

**To confirm with the legal adviser:** the current deadline, the format and the contact details; whether the 6 hours runs from when DevMSR notices or from when the hospital is told; and whether any other body must be told at the same time (for example the police for a crime, or a state health authority).

### Within the agreed time: tell the Data Protection Board and patients

When personal data is breached, the Digital Personal Data Protection Act, 2023 expects the data fiduciary (we expect this is the hospital) to inform the Data Protection Board of India and each affected person.

**To confirm with the legal adviser:**

- Whether these duties are in force on the go-live date, since the Act and its rules commence in stages.
- The deadlines. Our understanding of the Digital Personal Data Protection Rules, 2025 is: tell affected people and the Board without delay, and send the Board a detailed report within 72 hours. Please confirm.
- What the notice to patients must say, and in which languages.
- Whether a breach that affects no one's personal data still needs a report to the Board.

DevMSR's duty, as processor, to tell the hospital and how fast is set in the data processing agreement (`docs/drafts/data-processing-agreement-outline.md`).

### Investigate

The DevMSR technical lead finds out what happened, what data was affected, and whether it is still happening. The system keeps:

- **The audit log** (`audit_events`): every financial change, every patient record view, every user and role change, with the user, time, request ID and IP address. It holds IDs and codes, never patient names or numbers. Database triggers stop rows being changed or deleted. Before go-live the API will also run as a database user that cannot change these rows (stage 4).
- **Login history** (`login_events`): every successful and failed login, with the time and IP address.
- **Sessions**: which sessions were active and when each ended.
- **Server logs**: API and Caddy logs, with patient fields removed. **Not built yet:** keeping them for 180 days in India, out of the app's reach (stage 6).
- **Error reports**: Sentry, with patient data removed. **Not built yet** (stage 6).
- **Failed-login alert**: more than 20 failed logins in 10 minutes. **Not built yet** (stage 4).

Preserve evidence before changing anything that would destroy it: copy the relevant logs and audit rows, take a snapshot of the server or database if it may be rebuilt, and note the times. The system stores times in UTC and shows them in IST; say which one each note uses.

### Recover

- Restore from a known-good backup if data was damaged, following the restore drill steps (stage 6). Then check the bill and receipt counters: the next numbers must follow on from the last ones issued, with no gaps.
- Re-enter any paper documents written during the incident, as in the downtime procedure.
- Bring accounts back one by one, with new passwords, once the cause is fixed.

### Afterwards: review

Within two weeks of closing a level 1 or 2 incident, the incident lead, the DevMSR technical lead and the decision maker meet and write down: what happened, how it was noticed, what worked, what did not, and what changes. Changes to the system ship as normal pull requests and are recorded in `docs/decisions.md`.

## 7. Contact list

Fill in before go-live and keep a printed copy at the billing counter and with the incident lead. The system may be the thing that is down.

| Who | Name | Phone | Email |
| --- | --- | --- | --- |
| Hospital incident lead | | | |
| Deputy | | | |
| DevMSR technical lead | | | |
| DevMSR deputy | | | |
| MD or owner | | | |
| CERT-In point of contact | | | |
| Legal adviser | | | |
| Hospital IT support (computers, network) | | | |
| Internet provider | | | |
| CERT-In | See cert-in.org.in on the day | | |

## 8. Practice

Run a table-top exercise before go-live: walk through one level 1 incident (for example a stolen admin password) using this plan, and time how long it takes to reach the CERT-In point of contact. **To confirm with the hospital:** how often to repeat it after go-live.

## 9. Incident log

Start a new log for each incident. Keep it with the incident records for as long as the legal adviser says.

| Field | Entry |
| --- | --- |
| Incident number | |
| First noticed (date, time IST, by whom) | |
| What was noticed | |
| Severity level | |
| Systems and data affected | |
| Patients affected (count only, never names here) | |
| Containment steps (time, by whom) | |
| Reported to CERT-In (time, by whom, reference) | |
| Reported to the Data Protection Board (time, by whom) | |
| Patients told (time, how) | |
| Cause | |
| Closed (date, by whom) | |
| Lessons and changes | |

## 10. Open points

For the hospital:

- Names, deputies and phone numbers for every role in section 4 (questions MD-8 and MD-9 in `docs/hospital-questions.md`).
- Severity levels: adjust section 5 if the hospital sees them differently.
- How often to practise after go-live.

For the legal adviser:

- Which CERT-In incident types apply, who reports (the hospital, DevMSR or both), and from when the 6 hours runs.
- The breach duties under the Digital Personal Data Protection Act, 2023 and its rules: whether in force at go-live, deadlines, content and languages of notices.
- Any other body that must be told, and how long incident records must be kept.

For DevMSR, before go-live:

- A single action to end every session of a hospital.
- A tool to re-encrypt Aadhaar and ABHA numbers under a new field encryption key.
- The failed-login alert, Sentry, and 180-day log storage in India (stages 4 and 6).
