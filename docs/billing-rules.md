# Billing rules

This file is the only source of hospital billing rules. Rates, discounts, taxes, package contents, approval limits and numbering formats are never invented (`CLAUDE.md`, section 2, rule 4). If something is not answered here, ask the developer and record the answer here.

## Decided

### Patient UHID (2026-10-25)

- Format: `<HOSPITAL CODE>-<YEAR>-<6-digit number>`, for example `DEMO-2026-000001`.
- The year is the calendar year of registration (Asia/Kolkata). The number restarts at 000001 each year.
- Numbers are gapless, taken from a locked counter row in the same transaction as the registration.

### Patient registration (2026-10-25)

- Required to register: full name, sex, age or date of birth, and a mobile number. Address, guardian (S/o, D/o, W/o, H/o, C/o), emergency contact, Aadhaar and ABHA are optional.
- When only an age is given, the date of birth is estimated (today minus that many years) and marked as estimated.
- Duplicates: the same Aadhaar or ABHA number as an existing patient of the hospital is refused, and staff open the existing record instead. The same mobile number, or the same name with a birth year within one year, is a warning: staff may still register a new patient (families often share one mobile).
- No registration fee is charged in this slice. Whether there is one, and how much, is an open question below.

### Rates, fees and taxes (2026-10-25)

- The hospital enters its own rates. Nothing is hard-coded: every fee, room rent and charge is a service item with a dated rate, entered on the Rates and fees screen by a user with `tariffs.tariff.manage` (the finance role in the seeded roles).
- Each rate carries its tax rate (entered by the hospital, 0 if not taxed) and the date it applies from. A new rate closes the previous one the day before. Past rates are never edited, so old bills can always be explained.
- The demo hospital's rates in `prisma/seed-data.ts` are fake, for testing only.
- No registration fee: registering a patient is free.

### Bill, receipt, credit note and refund numbers (2026-10-25)

- Format: `<HOSPITAL CODE>/<TYPE>/<FINANCIAL YEAR>/<6-digit number>`, for example `DEMO/INV/2026-27/000001`.
- Types: `INV` invoice (bill), `RCT` receipt, `CN` credit note, `RF` refund.
- The financial year runs from 1 April to 31 March (Asia/Kolkata) and is written `2026-27`. Each type has its own series per financial year, restarting at 000001 on 1 April.
- Numbers are gapless, taken from a locked counter row in the same transaction as the document. A number is given when a bill is issued, not while it is a draft.

### Tax on bills (2026-10-25)

- Each charge uses the tax percentage on its rate, entered by finance (0 for an exempt service).
- Bills show tax per line, split into CGST and SGST of half each, and the hospital's GSTIN.

### Rounding (2026-10-25)

- Line amounts and tax are kept exact to the paisa. The bill total is rounded to the nearest rupee, shown as a separate "Round off" line.
- Tax on a line is rounded half up to the paisa. When a line's tax is split into CGST and SGST, an odd paisa goes to CGST.
- A total ending in exactly 50 paise rounds up to the next rupee.

### Discounts (2026-10-25)

- A discount can be given on the whole bill (an amount or a percentage) or on individual lines, always with a reason.
- The billing clerk requests it; someone else approves it (maker-checker). Finance approves when the bill's total discount is up to Rs 1,000; above that, only the MD or owner approves.
- Discounts come off before tax. A whole-bill discount is shared across the lines in proportion to their amounts, so each line's tax follows its own rate; any leftover paisa goes to the largest line.

### Refunds and credit notes (2026-10-25)

- Every refund, such as excess deposit returned at discharge, is approved by the MD or owner. The person who requests it cannot approve it.
- Issued bills are never edited. A mistake is corrected with a credit note, approved by finance. The person who requests it cannot approve it.

### Voids, credit notes and refunds (2026-10-25, slice 3b)

- A void can cancel a receipt entered by mistake (wrong patient, amount or mode) or a whole issued bill. Its number stays in the series, marked void. Finance or the MD approves; the person who asked cannot approve. Cancelling a whole bill is done as a full credit note.
- A credit note can cover the whole bill or part of it: staff choose the lines and the amount or quantity to credit on each.
- Refunds can be paid in cash, by UPI, by bank transfer or by cheque, with the same details as payments.
- A cash refund is paid by the cashier from their open shift, and lowers the cash expected in that drawer.
- To confirm: the system lets a receipt be voided only while its shift is still open (see `docs/decisions.md`).

### Payments and cash shifts (2026-10-25)

- Payment modes: cash; UPI (with the UTR reference); card (with the approval code and the card's last 4 digits); bank transfer or cheque (with the reference or cheque number and the bank).
- Each cashier opens a shift with the opening cash and closes it with a counted total. If the count differs from what the system expects, the shift closes with the difference and the cashier's reason, and finance sees it in the day-end report.

### Deposits (2026-10-25)

- Deposits are not revenue: they are held for the patient and set against bills.
- Finance sets a minimum advance for each room category. Admission warns when less is paid (IPD slice).

## Open questions

Each needs an answer from the hospital before the matching feature is built.

- Packages: contents, exclusions, length of stay, and how extra items outside a package are billed.
- Numbering formats: OPD token and IPD (admission) numbers.
- Room and nursing charges: what the midnight posting charges for the admission day and the discharge day.
- Title printed on bills: the screens print "Bill" for now. Whether it must read "Tax invoice", "Bill of supply" (for GST-exempt healthcare services) or show both, and which lines are exempt, is for the hospital's accountant to confirm.
