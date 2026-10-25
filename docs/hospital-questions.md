# Questions for the hospital

DevMSR HMS cannot guess the hospital's own rules (`CLAUDE.md` section 2, rule 4). This pack collects every decision the hospital still has to make before go-live: each item in stage 2 of `docs/go-live-checklist.md`, every open question in `docs/billing-rules.md`, and the details the stage 8 drafts in `docs/drafts/` need.

## How to use this pack

- The questions are grouped by who should answer: the MD or owner, the accountant (finance head), and the hospital admin. Some questions ask a second person to agree; that is noted on the question.
- Each question says why it matters, what it blocks, and the usual kinds of answer. The kinds of answer are there to make the choice easier. None of them is a recommendation, and "Other" is always allowed.
- Write the answer, your name and the date under each question. A rough answer is better than none: the developer will come back with follow-up questions.
- Section D lists rules the developer has already recorded so the build could continue. They were agreed with the developer, not yet with the hospital. Please confirm or correct each one.
- Answers go into `docs/billing-rules.md` (billing and numbering) or `docs/decisions.md` (everything else), with the date and the name of the person who answered.

Sent on: ____________ &nbsp;&nbsp; Returned on: ____________

## A. MD or owner

### MD-1. Packages

- **Question:** Which fixed-price packages does the hospital sell (for example a normal delivery, a caesarean section, a cataract surgery)? For each one: the price, what is included, what is excluded, the length of stay included, and how items outside the package are billed. The accountant should help fill in the details sheet in AC-6.
- **Why it matters:** A package bill must show the agreed price, not the sum of its parts. If the contents are unclear, staff either bill items twice or give them away.
- **What it blocks:** Slice 3b (packages and package overrides) and every IPD bill for a package patient.
- **Usual kinds of answer:**
  - No packages: everything is billed item by item.
  - A fixed list of packages, each with its own price, inclusions and exclusions.
  - Packages priced differently by room category (general ward, semi-private, private).
  - For extras: billed item by item at the normal rate; billed only above a quantity limit; or absorbed into the package.
  - For a stay longer than the package allows: extra days billed at the room rate; billed at a separate daily rate; or the package is dropped and everything is billed item by item.
- **Also answer:** Who may change a package price for one patient (a package override)? `CLAUDE.md` requires a second person to approve every override; please name the role that approves, and any limit.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### MD-2. Registration fee

- **Question:** Is there a fee to register a new patient? If yes: how much, is it charged once or at every visit, and does a registration expire after some time?
- **Why it matters:** The fee is collected at the front desk before the patient sees a doctor, so it shapes the registration screen and the cash count.
- **What it blocks:** Slice 4 (OPD).
- **Usual kinds of answer:** No fee; a one-time fee; a fee that is valid for a period (for example a year) and then renewed; a fee included in the first consultation fee.
- **Note:** The developer has recorded "no registration fee" so registration could be built (see D-3). Please confirm or correct.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### MD-3. How much data the hospital can afford to lose

- **Question:** If the server failed badly, how much recent work could the hospital afford to re-enter from paper: the last 15 minutes, the last hour, the last day?
- **Why it matters:** This sets how often backups are taken. A shorter time means more frequent backups, which may need a paid backup feature on the database host.
- **What it blocks:** The backup schedule and the restore drill in stage 6.
- **Usual kinds of answer:** Up to 24 hours (one backup a night); up to 1 hour; up to 15 minutes or less (continuous backup, which costs more). The developer will price each option before you decide.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### MD-4. How long the hospital can run on paper

- **Question:** If the system is down, how long can the hospital run on paper slips, bills and receipts before it becomes a serious problem: 1 hour, 4 hours, a full day?
- **Why it matters:** This sets how fast a failed server must be replaced, and how many paper forms each counter keeps ready.
- **What it blocks:** The recovery plan in stage 6 and the downtime procedure (`docs/drafts/downtime-procedure.md`).
- **Usual kinds of answer:** Under 1 hour; up to 4 hours; up to 1 working day; longer.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### MD-5. How long records must be kept

- **Question:** How long must the hospital keep medical records (OPD, IPD, discharge summaries) and financial records (bills, receipts, credit notes, refunds, cash shift tallies)? Please ask the hospital's legal adviser and chartered accountant.
- **Why it matters:** The system never deletes clinical or financial records (`CLAUDE.md` section 7). Backups and logs, however, are kept for a set time, and the privacy law expects personal data to be erased once there is no reason to keep it. The periods set both.
- **What it blocks:** How long backups are kept (stage 6), the privacy notice (`docs/drafts/privacy-notice-and-consent.md`) and the end-of-contract terms in the data processing agreement.
- **Usual kinds of answer:** One period for everything; separate periods for medical and financial records; longer periods for some patients (for example children, or medico-legal cases). Your advisers should name the rules each period comes from.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### MD-6. Moving data from the current system

- **Question:** Does any data move from the hospital's current system or registers into DevMSR HMS? If yes, which: patients and their old UHIDs, open balances, unused deposits, bills not yet paid?
- **Why it matters:** Imported data must be checked and loaded by a tested import, never typed into the database by hand. Deposits and balances are money owed to or by patients, so they must match to the paisa.
- **What it blocks:** The import step in stage 9, and possibly a small feature to store each patient's old UHID next to the new one.
- **Usual kinds of answer:**
  - Start fresh: no import, old records stay in the old system.
  - Patients only: names and contact details, new UHIDs, the old UHID kept for reference.
  - Patients plus open balances and deposits, as at the cutover date.
- **Also answer:** What the current system is called, and who can export data from it.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### MD-7. Data stays in India

- **Question:** Must the database, files, backups and logs all stay in India? Are any exceptions acceptable, and if so which?
- **Why it matters:** The plan is to keep the database in Supabase's Mumbai region and logs in India for 180 days (CERT-In). Some services named in the plan may store or pass data outside India, and the developer has not yet confirmed where each one keeps data:
  - Cloudflare R2, planned for files and backups. Whether R2 can guarantee storage inside India is not yet confirmed.
  - Sentry, planned for error reports with patient details removed.
  - The email provider (Resend), planned for emailed bills as password-protected PDFs.
  - Later: WhatsApp and SMS providers, and the payment gateway.
- **What it blocks:** The choice of hosting, file storage and backup storage in stage 6, and the sub-processor list in the data processing agreement.
- **Usual kinds of answer:** Everything in India, no exceptions; everything in India except error reports with no patient data; everything with patient data in India, other services anywhere. Your legal adviser should confirm what the law requires.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### MD-8. Who leads during a security incident

- **Question:** Who in the hospital leads the response to a cyber incident (for example a hacked account or data seen by the wrong person), and who stands in when they are away? Who decides what to tell patients?
- **Why it matters:** CERT-In expects certain cyber incidents to be reported within 6 hours of being noticed. That cannot wait for the right person to be found.
- **What it blocks:** The incident response plan (`docs/drafts/incident-response-plan.md`).
- **Usual kinds of answer:** The MD; the hospital admin; an IT manager; an outside IT firm. Please give a name, a deputy and a phone number for each.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### MD-9. Signing the data processing agreement

- **Question:** Who signs the data processing agreement with DevMSR for the hospital, and who is the hospital's legal adviser for it?
- **Why it matters:** The agreement sets who controls patient data and what DevMSR may do with it. It must be in place before real patient data goes in.
- **What it blocks:** Stage 8 and the go or no-go meeting in stage 9.
- **Usual kinds of answer:** A name and designation for each.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

## B. Accountant (finance head)

### AC-1. Title printed on bills under GST

- **Question:** What title must the hospital's bills carry: "Bill", "Tax invoice", "Bill of supply", or a different title depending on what the bill contains? Which of the hospital's services are exempt from GST, and which are taxable? Please confirm with the hospital's chartered accountant.
- **Why it matters:** Bills print "Bill" today as a placeholder. A wrong title or wrong tax on a bill is a compliance problem, and issued bills cannot be edited afterwards: each mistake needs a credit note.
- **What it blocks:** The first real bill.
- **Usual kinds of answer:**
  - All services exempt: every bill is a bill of supply.
  - Some services taxable: one document that shows both, or separate documents for taxable and exempt items.
  - A different arrangement your chartered accountant advises.
- **Also answer:** Must bills show SAC or HSN codes? Does the hospital have one GSTIN or more than one?

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### AC-2. Details printed on bills and receipts

- **Question:** Exactly what must appear on every bill and receipt? Today the system can print the hospital's name, address, city, state, PIN code, phone, email and GSTIN. What else: PAN, the hospital's registration number under the Clinical Establishments Act or the state's nursing home act, a footer, terms, a signature line? Please also send the logo (PNG or JPG, at least 600 pixels wide).
- **Why it matters:** These details are copied onto each bill when it is issued and never change afterwards, so they must be right before the first real bill.
- **What it blocks:** The first real bill and the hospital profile entered in stage 9.
- **Usual kinds of answer:** A list of the fields and the exact text.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### AC-3. Room and nursing charges for the admission day and the discharge day

- **Question:** A job will post room and nursing charges for each admitted patient at midnight IST. What should be charged for the day of admission, and for the day of discharge?
- **Why it matters:** Room rent is often the largest part of an IPD bill, and patients question it most.
- **What it blocks:** Slice 5 (IPD and beds).
- **Usual kinds of answer:**
  - Admission day: a full day whatever the time; a full day only if admitted before a set time; half a day after a set time.
  - Discharge day: no charge; a full day; a full day only if discharged after a set time (please give the time).
  - Day care (admitted and discharged on the same day): a fixed day-care charge; a full day; hours.
- **Also answer:** When a patient moves rooms during the day (for example from ICU to a ward), which room's rate is charged for that day? Are nursing charges a separate line, or part of the room rate?

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### AC-4. Minimum advance for each room category

- **Question:** What is the minimum advance deposit for each room category? What should happen at admission when less is paid?
- **Why it matters:** The amounts are entered by finance on the settings screen. The behaviour when too little is paid is a rule the system must follow.
- **What it blocks:** Slice 5 (IPD admission).
- **Usual kinds of answer for the behaviour:** A warning only, and admission goes ahead; admission goes ahead only with a named approver; no minimum for emergency admissions. The developer has recorded "a warning" so far (see D-11).

| Room category | Minimum advance (Rs) |
| --- | --- |
| | |
| | |
| | |

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### AC-5. IPD admission number format

- **Question:** What should an IPD admission number look like? Should it restart each calendar year, each financial year (April to March), or never?
- **Why it matters:** Admission numbers are printed on bills, wristbands and case files, and staff use them to find patients. Once real admissions are numbered, the format should not change.
- **What it blocks:** Slice 5 (IPD admission).
- **Usual kinds of answer:** A format like the UHID (hospital code, year, running number), a format like the bill numbers (hospital code, type, financial year, running number), or the format the hospital uses today. Please give one example number.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### AC-6. Package details sheet

- **Question:** For each package the MD lists in MD-1, fill in one row.
- **Why it matters and what it blocks:** As MD-1.

| Package name | Price (Rs) | Room category | Days included | Included | Excluded | Extras billed how |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |
| | | | | | | |

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### AC-7. Paper bills and receipts during downtime

- **Question:** When the system is down, staff will write paper bills and receipts (see `docs/drafts/downtime-procedure.md`). Please decide, with the chartered accountant:
  1. Do paper bills and receipts use their own pre-printed, numbered books, separate from the system's number series?
  2. What should the paper book numbers look like?
  3. When a paper document is entered into the system afterwards, the system gives it the next system number. Which document is the patient's official one: the paper one, the system one, or both, cross-referenced?
  4. If the system is down across midnight on 31 March, paper bills from the old financial year may be entered on or after 1 April. How must they be treated?
- **Why it matters:** The system's bill and receipt numbers are gapless and given only at the moment a document is issued in the system. Paper documents cannot take system numbers in advance without risking gaps or duplicates.
- **What it blocks:** The downtime procedure, and a small feature to record the paper number and the real date on documents entered later.
- **Usual kinds of answer:** For 1: a separate paper series per counter; a single paper series for the hospital. For 3: the paper one, with the system number written on its office copy; the system one, given to the patient later; both.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

## C. Hospital admin

### AD-1. OPD token format

- **Question:** How should OPD tokens work? Is the token numbered per doctor, per department or for the whole hospital? Does it restart every day? Is there a prefix?
- **Why it matters:** Patients wait by token number, so it must match how the hospital calls them today.
- **What it blocks:** Slice 4 (OPD).
- **Usual kinds of answer:** Per doctor, from 1 each day; per department with a prefix (for example a letter for each department); one running number for the whole hospital each day. Please give an example, and say whether follow-up and new patients share one sequence.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### AD-2. Who gets which role

- **Question:** For each role in `docs/drafts/access-policy.md`, which staff (by designation) should get it? Who approves a request for a new account?
- **Why it matters:** Each role decides what a person can see and do, including patient records and money. Giving more access than needed is the most common cause of misuse.
- **What it blocks:** Creating real staff accounts in stage 9, and the access policy.
- **Usual kinds of answer:** A list of designations against each role; the approver is the head of department, the hospital admin, or the MD.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### AD-3. How the admin learns that someone has left

- **Question:** How will the hospital admin hear, on the same day, that a staff member has left, been suspended or changed jobs?
- **Why it matters:** The access policy asks for a leaver's account to be deactivated the same day. That only works if someone tells the admin.
- **What it blocks:** The access policy.
- **Usual kinds of answer:** HR emails or calls the admin; the head of department tells the admin; a leaving form includes "system access removed" with the admin's signature.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### AD-4. Who runs the monthly user review

- **Question:** Who reviews the list of active users and their roles each month, and who signs it off?
- **Why it matters:** The review catches accounts that should have been removed and roles that have grown over time.
- **What it blocks:** The access policy.
- **Usual kinds of answer:** The hospital admin prepares it and the MD signs; each head of department checks their own staff.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### AD-5. Downtime arrangements

- **Question:** For the downtime procedure, please answer:
  1. Who declares that the hospital has switched to paper, and after how many minutes of the system being down?
  2. Who keeps the paper registration slips, bill books and receipt books, and where?
  3. Does the hospital have a second internet connection (a second provider, or a mobile hotspot at the billing counter)?
  4. Who enters paper documents into the system afterwards, and who checks them?
- **Why it matters:** A downtime is stressful. Staff should not have to decide these things on the day.
- **What it blocks:** The downtime procedure (`docs/drafts/downtime-procedure.md`).

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### AD-6. Patient requests about their data

- **Question:** Who in the hospital handles a patient's request to see, correct or erase their personal data, or a complaint about how it was used? What contact details should the privacy notice give (an email address, a phone number, a desk)?
- **Why it matters:** The privacy law gives patients these rights and expects a named contact. The privacy notice cannot be finished without one.
- **What it blocks:** The privacy notice (`docs/drafts/privacy-notice-and-consent.md`).
- **Usual kinds of answer:** The hospital admin; the medical records officer; a grievance officer named for this purpose.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

### AD-7. Language of the privacy notice and consent

- **Question:** In which languages must the privacy notice and the consent wording be available at the registration desk?
- **Why it matters:** Patients must be able to understand what they agree to. The screens are in English now, with Hindi planned later.
- **What it blocks:** The privacy notice and the registration screen.
- **Usual kinds of answer:** English and Hindi; English, Hindi and the state's language; others. Your legal adviser should confirm what the law requires.

Answer:

&nbsp;

Answered by: ____________ &nbsp;&nbsp; Date: ____________

## D. Rules already recorded: please confirm

The developer recorded these in `docs/billing-rules.md` so the build could continue. Please tick "Confirmed" or write the correction. The MD and the accountant should both read this section.

| No. | Rule recorded | Who should confirm | Confirmed | Correction |
| --- | --- | --- | --- | --- |
| D-1 | UHID format `<HOSPITAL CODE>-<YEAR>-<6-digit number>`, for example `DEMO-2026-000001`, restarting at 000001 every calendar year | Admin | | |
| D-2 | To register a patient, staff must enter the full name, sex, age or date of birth, and a mobile number. Address, guardian, emergency contact, Aadhaar and ABHA are optional | Admin | | |
| D-3 | No registration fee | MD | | |
| D-4 | The same Aadhaar or ABHA number as an existing patient is refused. The same mobile number, or the same name with a birth year within one year, only warns | Admin | | |
| D-5 | Bill, receipt, credit note and refund numbers: `<HOSPITAL CODE>/<TYPE>/<FINANCIAL YEAR>/<6-digit number>`, for example `DEMO/INV/2026-27/000001`, each type restarting on 1 April | Accountant | | |
| D-6 | Tax per line, split equally into CGST and SGST, with any odd paisa going to CGST | Accountant | | |
| D-7 | Bill total rounded to the nearest rupee on a separate "Round off" line, 50 paise rounding up | Accountant | | |
| D-8 | Discounts on the whole bill or on lines, always with a reason, taken off before tax. Finance approves a bill's total discount up to Rs 1,000; above that only the MD or owner | MD and accountant | | |
| D-9 | Every refund, including excess deposit at discharge, is approved by the MD or owner | MD | | |
| D-10 | Mistakes on issued bills are corrected only by a credit note, approved by finance | Accountant | | |
| D-11 | Admission warns, but does not stop, when the advance paid is below the room category's minimum | MD and accountant | | |
| D-12 | Payment modes: cash; UPI with the UTR reference; card with the approval code and last 4 digits; bank transfer or cheque with the reference and bank | Accountant | | |
| D-13 | A cash shift that does not tally closes with the difference and the cashier's reason, shown to finance in the day-end report | Accountant | | |
| D-14 | Each rate carries its own tax percentage, entered by finance, and the date it applies from. Past rates are never edited | Accountant | | |
| D-15 | Billing clearance needs the whole account settled: every charge billed, nothing due, and any deposit or overpayment set against bills or refunded. Only the MD can clear with money still due | MD and accountant | | |
| D-16 | A stay that crosses no midnight is charged one day, at the rate of the room the patient is in when the final bill is prepared | Accountant | | |
| D-17 | Only the treating doctor marks a patient fit and writes the discharge summary; whoever writes it can never sign it off. The patient leaves only after the MD signs it | MD | | |
| D-18 | The Tally day book is a CSV with one row per bill, receipt, deposit, credit note and refund, dates as YYYY-MM-DD, the patient's UHID (no names) and amounts in rupees. A void receipt keeps its row at zero | Accountant | | |
