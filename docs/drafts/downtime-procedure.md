# Downtime procedure

> **Draft for review by the hospital and its legal adviser. Not legal advice.**
>
> Written by DevMSR on 2026-10-25 from what the system does today. Points the hospital, its chartered accountant or DevMSR still have to settle are marked "To confirm" and collected at the end. Stage 8 of `docs/go-live-checklist.md` tracks it.

## 1. Purpose

Patients keep arriving when the system or the internet is down. This procedure lets the front desk, billing and cash counters keep working on paper, then enter everything into DevMSR HMS afterwards, without breaking the gapless number series and without losing or doubling any money.

If the outage may have a security cause (for example ransomware, or data changed that nobody can explain), also follow `docs/drafts/incident-response-plan.md`.

## 2. How the system numbers documents, and why it matters here

From `docs/billing-rules.md` and `docs/decisions.md`:

- **UHIDs** look like `DEMO-2026-000001`: hospital code, calendar year, running number. A UHID is given at the moment a patient is registered in the system.
- **Bills, receipts, credit notes and refunds** look like `DEMO/INV/2026-27/000001`: hospital code, type, financial year (April to March), running number. A bill gets its number at the moment it is issued in the system, not while it is a draft. A receipt gets its number when it is taken.
- Every series is **gapless**. The next number comes from a locked counter row in the same database transaction as the document. The database refuses any counter move other than one step up, and issued bills and receipts can never be edited or deleted.

So the system cannot hand out numbers in advance, and nothing written on paper can carry a system number. Reserving a block of numbers for paper use would leave gaps whenever some went unused, so this procedure does not do that.

Instead, **paper documents carry their own paper numbers** from pre-printed books, and each one gets a system number only when it is entered afterwards. The system series stays gapless, and every paper document is linked to its system twin. Which of the two is the official document for the patient and for GST is a decision for the hospital's accountant and chartered accountant (question AC-7 in `docs/hospital-questions.md`).

## 3. Before go-live: the paper kit

Each counter keeps a sealed downtime kit. The hospital admin checks it every month and after every use.

| Item | Where | Notes |
| --- | --- | --- |
| Paper registration slips, pre-numbered | Front desk | Name, sex, age or date of birth, mobile, address, guardian, emergency contact, visit type, doctor. No Aadhaar or ABHA on paper (section 6) |
| Bill book, pre-numbered, in duplicate | Billing counter | One copy to the patient, one stays in the book |
| Receipt book, pre-numbered, in duplicate | Each cash counter | Mode of payment and reference, as on the system (cash, UPI with UTR, card with approval code and last 4 digits, transfer or cheque with reference and bank) |
| Deposit receipts | Each cash counter | The receipt book may be used, marked "Advance deposit" |
| The current rate list, printed | Billing counter | Printed from the Rates and fees screen after every rate change. To confirm with DevMSR: a printable rate list does not exist yet |
| Downtime register | Front desk | One line per paper document: paper number, time, patient, written by, and later the system number and who entered it |
| This procedure, printed | Every counter | |
| Contact list from the incident response plan | Every counter | |

**To confirm (AC-7):** the paper book numbering, whether each counter has its own series or the hospital has one, and the wording printed on the books.

Paper books are controlled stationery: kept by a named person (question AD-5), issued against a signature, and never torn. A spoilt slip or bill is crossed through, marked "Cancelled", and left in the book.

## 4. Declaring a downtime

1. A counter cannot reach the system. Check whether it is just that computer: try another computer, and another site (for example a search engine).
2. If the system is unreachable from every computer for more than **To confirm (AD-5)** minutes, the person named in AD-5 declares a downtime and writes the start time in the downtime register.
3. They tell the DevMSR technical lead by phone (contact list) and every department: front desk, billing, cash, wards.
4. If only the hospital's internet is down, switch to the backup connection if there is one (question AD-5) before going to paper.

## 5. During the downtime

### Front desk: registering patients

- Ask whether the patient has been here before. If they have a UHID card or an old bill, write their UHID on the slip. Do not create a new patient for a returning one.
- For a new patient, fill in a paper registration slip. Write the slip number on everything that follows for that patient (the token, the bill, the receipt) until the patient has a UHID.
- Record the slip in the downtime register.

### Billing counter: charges and bills

- Use the printed rate list. Write the date the service was given on each line.
- Write the bill in the bill book. Total it by hand following the same rules as the system (`docs/billing-rules.md`: tax per line split into CGST and SGST, total rounded to the nearest rupee). **To confirm with the accountant:** whether to write tax on paper bills at all, or give a provisional bill and issue the tax document from the system later.
- Discounts, refunds, voids and package overrides still need a second person's approval. Write the approver's name, the reason and the time on the office copy. **To confirm with the MD:** whether these may be given at all during a downtime, or must wait for the system.

### Cash counters: payments and deposits

- Write a receipt from the receipt book for every payment and deposit. Note the mode and its reference.
- Keep paper-receipt cash separate in the drawer, or note it on the shift sheet, so the count can be matched later.
- If a cash shift was open in the system when it went down, it stays open. Do not start a new shift on paper.

### Wards

- Write admissions, transfers and discharges on paper with the time. Bed changes are entered later in time order (once the IPD slice exists).

## 6. Aadhaar and ABHA during a downtime

Do not write Aadhaar or ABHA numbers on paper slips. In the system they are encrypted and shown only as the last 4 digits; a full number on paper loses that protection. Collect them (if the patient wishes to give them) when the patient is registered in the system.

## 7. When the system is back

1. The DevMSR technical lead confirms the system is working and that no data was lost. If data was restored from a backup, they say from what time, so everything after that time is re-entered too.
2. The person who declared the downtime writes the end time in the register and tells every department.
3. New patients go straight into the system again. Paper entry runs alongside, at a quiet counter if possible.

## 8. Entering paper documents afterwards

Enter in this order, oldest first within each step, so numbers follow the order things happened as closely as possible:

1. **Registrations.** Register each new patient from their slip. Run the duplicate check as usual: the patient may have registered at another counter during the same downtime. Write the new UHID on the slip and in the downtime register.
2. **Charges.** Post each charge with the service date written on the paper bill. The system already accepts a past service date (never a future one) and uses the rate that was in force on that date, which is the rate on the printed list.
3. **Bills.** Draft and issue a bill for each paper bill. The system gives it the next number in the series. Write the system number on the paper office copy, and the paper number in the downtime register against it.
4. **Receipts and deposits.** Take each paper receipt into the cashier's open shift. If the shift was closed, the cashier opens a new one. Write the system receipt number on the paper office copy.
5. **Approvals.** Request and approve any discount, refund or void through the system, by the same two people who signed the paper.

Each entry is made by the person named in AD-5 and checked by a second person, who ticks the downtime register.

### Known gaps in the system today

These are not built. Each needs a decision, then work by DevMSR, and is listed so the hospital knows what the procedure relies on.

- **Paper reference.** Patients, bills and receipts have no field for the paper slip, bill or receipt number. Until one exists, the link lives only in the downtime register and on the paper office copies.
- **Real date and time.** A bill's issue date and a receipt's date are when they were entered, not when the paper was written. Charges keep the real service date, but receipts do not.
- **Financial year at the boundary.** A paper bill written on 31 March but entered on 1 April gets a number in the new financial year's series. **To confirm with the chartered accountant (AC-7):** how such a bill must be treated.
- **Cash shift timing.** Paper cash taken while a shift was open may be entered after that shift has closed, so it lands in a later shift. The day-end report needs to show which receipts were downtime entries.
- **A downtime marker.** Nothing in the audit log marks an entry as a re-entry from paper. Adding one would let the accountant list every downtime document.
- **Midnight room charges.** The IPD slice will post room and nursing charges at midnight. If the system is down at midnight, that job must catch up when it is back without charging any day twice. Build this into the IPD slice.

## 9. Closing the downtime

The downtime is closed only when:

- every line in the downtime register has a system number and a checker's tick;
- the count of paper slips, bills and receipts used matches the register, including cancelled ones;
- each cashier's cash count matches their system receipts plus their paper receipts;
- the accountant has seen the register and signed it.

Keep the paper books and the register as financial records, for as long as the hospital decides (question MD-5).

## 10. Practice

Rehearse one downtime on staging before go-live (stage 7 UAT): register two patients, bill one and take a payment on paper, then enter them and close the downtime. Time how long the entry takes. **To confirm with the hospital:** how often to rehearse after go-live.

## 11. Open points

For the hospital (questions AD-5 and MD-4 in `docs/hospital-questions.md`):

- Who declares a downtime, and after how many minutes.
- Who keeps the paper books, who enters and who checks.
- Whether there is a backup internet connection.
- Whether discounts, refunds and voids may be given during a downtime.

For the accountant and chartered accountant (question AC-7):

- Paper book numbering and wording.
- Which document is official: the paper one, the system one, or both.
- Tax on paper bills, and bills that cross 31 March.

For DevMSR:

- A printable rate list.
- A paper reference and the real date on bills and receipts entered after a downtime, a downtime marker in the audit log, and a downtime section in the day-end report.
- Catch-up for the midnight room charge job.
