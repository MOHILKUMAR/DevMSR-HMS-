# Billing rules

This file is the only source of hospital billing rules. Rates, discounts, taxes, package contents, approval limits and numbering formats are never invented (`CLAUDE.md`, section 2, rule 4). If something is not answered here, ask the developer and record the answer here.

Status: no rules defined yet.

## Open questions

Each needs an answer from the hospital before the matching feature is built.

- Tariffs: which rate lists exist (for example by payer type or room category), and who may change them.
- Taxes: which services carry GST, at what rates, and how tax is shown on bills.
- Rounding: how line totals and bill totals are rounded.
- Discounts: who may request one, the approval limits per role, and whether discounts apply per line or per bill.
- Packages: contents, exclusions, length of stay, and how extra items outside a package are billed.
- Deposits and refunds: minimum advance per admission type, and refund approval limits.
- Numbering formats: UHID, OPD token, IPD number, invoice, receipt, credit note and refund numbers.
- Room and nursing charges: what the midnight posting charges for the admission day and the discharge day.
