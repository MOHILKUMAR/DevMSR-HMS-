# Patient privacy notice and consent at registration

> **Draft for review by the hospital and its legal adviser. Not legal advice.**
>
> Written by DevMSR on 2026-10-25 from what the system does today. Points about the Digital Personal Data Protection Act, 2023 (the DPDP Act) and its rules are written as questions for the legal adviser, not as settled law. Stage 8 of `docs/go-live-checklist.md` tracks it.

This file has five parts:

- Part A: facts about what DevMSR HMS collects and how it protects it, for the legal adviser.
- Part B: the privacy notice, in words a patient can read at the registration desk.
- Part C: the consent wording the receptionist reads out and the screen shows.
- Part D: how patients ask to see, correct or erase their data.
- Part E: questions for the legal adviser.

Text in square brackets, such as [Hospital name], is filled in by the hospital.

## Part A: what the system does today

### Who is who

We expect the hospital to be the **data fiduciary** (it decides why and how patient data is used) and DevMSR to be the **data processor** (it runs the system for the hospital, on the hospital's instructions). **Question E-1** asks the legal adviser to confirm. The data processing agreement (`docs/drafts/data-processing-agreement-outline.md`) is written on that basis.

### Personal data about patients

| Data | When collected | Required? | How it is held |
| --- | --- | --- | --- |
| Full name, sex, age or date of birth (marked as estimated when only an age is given) | Registration | Required | Database in [India, to confirm] |
| Mobile number | Registration | Required | Stored in one standard form (+91 and 10 digits) for duplicate checks |
| Address, city, state, PIN code | Registration | Optional | |
| Guardian's name and relation (S/o, D/o, W/o, H/o, C/o) | Registration | Optional | |
| Emergency contact name and phone | Registration | Optional | |
| Aadhaar number | Registration | Optional | Encrypted (AES-256-GCM). Only the last 4 digits are ever shown. A one-way code allows duplicate checks without decrypting. See question E-6 |
| ABHA number | Registration | Optional | Encrypted and masked in the same way as Aadhaar |
| UHID | Registration | Given by the system | Never changes |
| Charges, bills, receipts, deposits, refunds | Each visit or stay | | Issued bills and receipts can never be changed or deleted; mistakes are corrected with credit notes |
| Payment references: UPI UTR, card approval code and last 4 digits, cheque or transfer reference and bank | Each payment | | The full card number is never collected |
| Consultation notes, orders, admissions, discharge summaries | OPD and IPD (later phase 1 slices) | | Not built yet |
| Lab, pharmacy, insurance and ABDM data | Phases 2 and 3 | | Not built yet |

### How the system protects it

- **Who can see it.** Staff see only what their role allows (`docs/drafts/access-policy.md`). DevMSR's platform account cannot open patient records through the app; a logged, time-limited break-glass access is planned.
- **A record of every look.** Every time a patient's record or bills are opened, the system writes an audit event naming the staff member. Patient searches record how the search was done and how many results were shown, never what was typed. Audit events cannot be changed or deleted.
- **Kept out of logs and links.** Patient names, phone numbers, Aadhaar and ABHA numbers never appear in web addresses, server logs or error messages; records are found by random IDs.
- **Encryption.** All traffic is encrypted (HTTPS). Aadhaar and ABHA numbers are also encrypted inside the database. Backups are planned to be encrypted.
- **Never deleted by mistake.** Clinical and financial records are never hard deleted (see question E-9 on erasure).
- **No real data in testing.** Development and testing use made-up patients only.
- **Where it is stored.** Planned: the database in Supabase's Mumbai region. Whether files, backups, error reports and emails also stay in India is still open (question MD-7 in `docs/hospital-questions.md`).

### Who else may receive patient data

| Recipient | What | Status |
| --- | --- | --- |
| DevMSR, as processor | Everything in the system, for running it | Under the data processing agreement |
| DevMSR's service providers (hosting, database, file storage, email, error monitoring) | Stored or passed through on DevMSR's behalf | Listed in the data processing agreement |
| The patient, by email | Bills, as a password-protected PDF. The email itself shows only the hospital name, bill number, date and amount | Planned |
| The patient, by SMS or WhatsApp | Tokens, reminders, payment links | Phase 2 |
| Insurers and TPAs | Claim documents | Phase 3 |
| ABDM (the Ayushman Bharat Digital Mission) | Health records the patient chooses to link | Phase 3, with its own consent |
| Government bodies | Only where the law requires | |

## Part B: privacy notice for patients

> **[Hospital name]: how we use your personal information**
>
> **Who we are.** [Hospital name], [address]. We are responsible for your personal information. We use a hospital software system called DevMSR HMS, run for us by DevMSR, to register you, bill you and keep your records.
>
> **What we collect.** Your name, sex, age or date of birth, mobile number and, if you choose to give them, your address, a guardian's name, an emergency contact, your Aadhaar number and your ABHA number. As you are treated we also record your visits, the services you receive, your bills and your payments. [Later: your medical notes, test results and medicines.]
>
> **Why we collect it.** To identify you and keep one record for you, to treat you, to bill you and give you receipts, to contact you about your visit, and to meet our duties under the law. [Question E-3: list each purpose and whether it relies on your consent or on another basis in the law.]
>
> **Aadhaar and ABHA are optional.** You can be registered and treated without giving them. If you give them, we use them only to avoid making two records for you [and to link your ABHA health records, if you ask us to]. We keep them encrypted, and our staff see only the last 4 digits.
>
> **Who sees it.** Only our staff who need it for their work. Every time a staff member opens your record, the system records who and when. DevMSR and the companies that host the system for it handle your information only to run the system for us, under a written agreement. We share your information with others only [with your consent, for example with your insurer, or] when the law requires it.
>
> **Where it is kept.** On secure servers in [India, to confirm].
>
> **How long we keep it.** [Period, to confirm with question MD-5], because the law requires hospitals to keep medical and financial records. [Question E-9: what happens after that.]
>
> **Your rights.** You can ask us: what information we hold about you and who we have shared it with; to correct or complete it; to erase information we no longer need to keep; and to name a person to act for you if you cannot. You can withdraw any consent you have given, as easily as you gave it; this does not affect care already given or records the law requires us to keep. [Question E-4: confirm this list.]
>
> **How to ask or complain.** Contact [name or designation], [email], [phone], or the registration desk. We will reply within [period, question E-5]. If you are not satisfied, you may complain to the Data Protection Board of India. [Question E-5.]
>
> **If something goes wrong.** If your information is ever exposed to someone who should not have it, we will tell you and the authorities as the law requires.
>
> Last updated: [date]

## Part C: consent at registration

### What the receptionist says

> "We are registering you in our hospital system so we can treat you and bill you. We will keep your details safe and only our staff who need them can see them. This card [or screen] explains how we use your information. Is that all right with you?"
>
> If the patient offers an Aadhaar or ABHA number: "Giving your Aadhaar [or ABHA] number is your choice. You will be treated the same without it. Do you want us to record it?"

### What the registration screen shows

Each line is a separate tick box. None is ticked in advance.

1. **Required to register** [Question E-2: whether consent is the right basis here, or whether treatment and billing rely on another basis so no tick box is needed]:
   "The patient [or their guardian] has been told how [Hospital name] uses their personal information, as in the privacy notice, and agrees to it being used for treatment, billing and the hospital's legal duties."
2. **Only when an Aadhaar or ABHA number is entered:**
   "The patient [or guardian] chose to give their [Aadhaar / ABHA] number, to avoid duplicate records, and knows it is optional."
3. **Optional, phase 2:**
   "The patient agrees to receive appointment and billing messages by SMS, WhatsApp or email."

The system would record, for each tick: who ticked it, when, the version of the notice shown, and whether the patient or a guardian gave it. **Not built yet:** today's registration screen has no consent fields. Adding them is a change to the registration slice, once the wording is approved.

### Patients who cannot consent themselves

- **Children.** [Question E-7: what consent is needed for a patient under 18, from whom, and how a guardian is verified at a hospital desk.]
- **Adults who cannot decide for themselves** (unconscious, or a person with a disability who has a lawful guardian). [Question E-7.]
- **Emergencies.** [Question E-8: whether treatment and registration in an emergency can go ahead before consent, and when consent is then taken.]

The registration form already has a guardian field (name and relation), which these cases would use.

## Part D: how patients ask to see, correct or erase their data

1. The patient (or their nominee or guardian) asks at the registration desk or by [email]. Staff note the request in a register (date, UHID, what was asked). Never by an open WhatsApp group.
2. Staff check identity: the UHID card or a bill, and a photo ID. [Question E-5: what identity check is reasonable.]
3. The request goes to the person named in question AD-6.
4. **To see their data:** the hospital gives a printout of the patient's registration details and bills. **Not built yet:** a one-click "everything we hold about this patient" export. Until then DevMSR prepares it on request.
5. **To correct it:** a receptionist edits the patient's details. Every edit is recorded in the audit log, showing which fields changed and who changed them. The UHID never changes. Issued bills are never edited; they keep the details printed on the day.
6. **To erase it:** the hospital checks whether the law requires it to keep the record (question E-9). The system never hard deletes clinical or financial records, so erasure, where it applies, would need a new feature (for example removing optional fields such as address or emergency contact). [Question E-9.]
7. Reply within the time the law sets (question E-5), and note the reply in the register.

## Part E: questions for the legal adviser

Each one is open. Please answer in writing; the answers go into `docs/decisions.md`.

- **E-1. Roles.** Is the hospital the data fiduciary and DevMSR the data processor for all patient data in the system? Does anything change for the super admin's break-glass access?
- **E-2. Basis for using data.** For treatment and billing, does the hospital rely on the patient's consent, or on a "legitimate use" under section 7 of the DPDP Act (for example a medical emergency, or a legal duty)? Does that change for OPD visits compared with emergencies? Is a tick box at registration needed at all?
- **E-3. Notice contents.** What must the notice contain under the DPDP Act and its rules, and does Part B cover it? Must it be given before or at the time of collection, and in what form (printed card, screen, sign at the desk)?
- **E-4. Rights.** Is the list of rights in Part B complete and correctly worded (access, correction, completion, erasure, grievance, nomination, withdrawal of consent)?
- **E-5. Grievances and deadlines.** Who must be named as the contact, and must they be in India? What is the deadline to answer a request or a grievance? What identity check is reasonable? Our understanding is that the DPDP Rules, 2025 set a maximum period for grievances; please confirm it and whether it applies on our go-live date.
- **E-6. Aadhaar.** May a private hospital collect Aadhaar numbers at all, given the Aadhaar Act, 2016 and the Supreme Court's 2018 judgment on it? If yes, on what conditions (purpose, consent, storage, masking)? If no, the field should be removed before go-live.
- **E-7. Children and guardians.** What consent is needed for patients under 18, and for adults with a lawful guardian? Our understanding is that the DPDP Rules, 2025 exempt some processing by clinical establishments from the verifiable parental consent rule; please confirm whether and how far it applies here.
- **E-8. Emergencies.** Can an emergency patient be registered and treated before any notice or consent, and what must happen afterwards?
- **E-9. Retention and erasure.** How do the DPDP Act's erasure duties fit with the hospital's duty to keep medical and financial records (question MD-5)? What must happen to a record once its retention period ends?
- **E-10. Language.** In which languages must the notice and consent be offered (question AD-7)?
- **E-11. Commencement.** Which parts of the DPDP Act and the DPDP Rules, 2025 are in force on the planned go-live date, and which come later? Does the hospital need to do anything differently in the meantime?
- **E-12. Other laws.** Do any health-specific rules (for example medical council rules on confidentiality, state clinical establishment rules, or ABDM's own consent rules for phase 3) add to this notice?
- **E-13. Consent records.** How long must the record of each consent be kept, and what must it show?
