# How DevMSR HMS protects, backs up and recovers your hospital's data

This page is written for the hospital: the MD, the accountant, the administrator and anyone who asks how patient and billing records are kept safe. It is one of the four promises DevMSR HMS makes, so it says what is true today and marks what is still being put in place. The technical steps behind each point are in `docs/runbooks/`.

Last reviewed: 25 Oct 2026. Status: **before go-live**. Items marked *(before go-live)* are prepared but not yet running for the hospital.

## Where your data lives

- The database runs on Supabase in its **Mumbai** region *(before go-live)*, used as a plain PostgreSQL database. Only the application server's address may connect to it.
- The application runs on a server in an Indian data centre *(before go-live: the host is being chosen)*. Cloudflare sits in front of it and the server accepts web traffic only from Cloudflare.
- Backups and log copies go to storage in a separate account. Whether that storage must be in India is a decision for the hospital; DevMSR recommends an Indian region *(open decision)*.
- Development and testing use made-up patients only. Real patient data never leaves the production system.

## Who can see what

- Every member of staff has their own login. Passwords are stored only as Argon2id hashes, and an account locks for 15 minutes after 5 wrong passwords. Every successful and failed login is recorded.
- Two-step login (an authenticator app code) for administrators and finance staff *(being built)*.
- Sessions end after 15 minutes without use and after 12 hours at most, and when the browser closes. Staff will be able to see and end their own sessions *(being built)*.
- Each role sees only what its job needs: a receptionist cannot change bills, a cashier sees only their own cash shift, cost and profit reports are for finance and the MD only. The server checks every request, not just the screen.
- Discounts, refunds and voids need a second person with the right permission. Nobody can approve their own request.
- DevMSR's own support staff do not open patient records in normal work. Emergency access needs a written reason, lasts one hour, is recorded, and the hospital administrator is told *(being built)*.

## How records are protected

- **Bills cannot be changed once issued.** The database itself refuses any change to an issued bill; corrections are made with credit notes. Bill and receipt numbers run without gaps within each financial year, and UHIDs within each year.
- **Every change to money and every view of a patient record is recorded** in an audit trail that the application cannot edit or delete.
- **Aadhaar and ABHA numbers are encrypted** in the database and shown with only the last 4 digits. Searching for them never decrypts them.
- **Nothing personal in addresses or logs.** Web addresses carry only random identifiers, never names, phone numbers, Aadhaar or ABHA numbers, and logs leave these out.
- All traffic is encrypted (HTTPS, with HSTS), with security headers on every page, protection against cross-site request forgery, and limits on how fast anyone can try passwords or call the system.
- The server: login by key only, a firewall that admits only Cloudflare and the developer, automatic security updates, and a clock synced to Indian government time servers so log times can be trusted *(before go-live)*.
- Before real patients, a CERT-In empanelled auditor tests the system (VAPT), and every high and critical finding is fixed and retested *(before go-live)*.

## Backups

- Every night at 02:00 IST, and before every software update that changes the database, the whole database is copied, **encrypted**, and stored in a separate account *(before go-live)*. Supabase also keeps its own daily backups.
- The encryption keys are held by DevMSR and by the hospital (a printed copy for the hospital's safe). The server that makes the backups cannot read them, and recent backups cannot be deleted, even by someone who takes over the server.
- How often backups run, and how long they are kept, follow the hospital's decision on how much data it can afford to lose *(open decision; until then: nightly, kept at least 90 days)*.

## Proving the backups work

- At least every quarter, and before go-live, the latest backup is restored into a separate, temporary database and checked: every bill, receipt and UHID series is complete with no gaps, the audit trail is intact and still protected, the application starts on it, and the Aadhaar and ABHA numbers can still be read with the hospital's key. Each drill is recorded with its date, result and how long the restore took *(first drill before go-live)*.
- The same backup and restore runs automatically every time DevMSR changes its deployment or database scripts.

## If something goes wrong

- **The system is down or slow:** an outside service checks the system every minute and alerts the developer. Staff switch to the paper downtime forms, and entries are added afterwards in number order so no bill or receipt number is skipped *(downtime procedure being agreed with the hospital)*.
- **Data is damaged or lost:** the database is restored from the newest good backup into a new database, checked as above, and the system is pointed at it. The damaged copy is kept for investigation.
- **A security incident:** DevMSR and the hospital follow the incident response plan, including reporting to CERT-In within 6 hours where the rules require it *(plan being written with the hospital)*.
- **Software updates** are released in tested, numbered versions. If an update misbehaves, the previous version is restored within minutes.

## Logs

System and access logs are kept for 180 days on the server in India, with an encrypted copy off the server, as CERT-In requires. They show who used the system and when, without patient details *(before go-live)*.

## Questions

Ask DevMSR for the details behind any point on this page. The hospital may share this page with patients, auditors and regulators.
