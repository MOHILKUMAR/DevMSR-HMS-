# Billing rules

This file is the only source of hospital billing rules. Rates, discounts, taxes, package contents, approval limits and numbering formats are never invented (`CLAUDE.md`, section 2, rule 4). If something is not answered here, ask the developer and record the answer here.

## Decided

### Patient UHID (2026-10-25)

- Format: `<HOSPITAL CODE>-<YEAR>-<6-digit number>`, for example `DEMO-2026-000001`.
- The year is the calendar year of registration (Asia/Kolkata). The number restarts at 000001 each year.
- Numbers are gapless, taken from a locked counter row in the same transaction as the registration.

### Rates, fees and taxes (2026-10-25)

- The hospital enters its own rates. Nothing is hard-coded: every fee, room rent and charge is a service item with a dated rate, entered on the Rates and fees screen by a user with `tariffs.tariff.manage` (the finance role in the seeded roles).
- Each rate carries its tax rate (entered by the hospital, 0 if not taxed) and the date it applies from. A new rate closes the previous one the day before. Past rates are never edited, so old bills can always be explained.
- The demo hospital's rates in `prisma/seed-data.ts` are fake, for testing only.

## Open questions

Each needs an answer from the hospital before the matching feature is built.

- Taxes: which services carry GST, at what rates, and how tax is shown on bills.
- Rounding: how line totals and bill totals are rounded.
- Discounts: who may request one, the approval limits per role, and whether discounts apply per line or per bill.
- Packages: contents, exclusions, length of stay, and how extra items outside a package are billed.
- Deposits and refunds: minimum advance per admission type, and refund approval limits.
- Numbering formats: OPD token, IPD number, invoice, receipt, credit note and refund numbers.
- Room and nursing charges: what the midnight posting charges for the admission day and the discharge day.
