# Access policy

> **Draft for review by the hospital and its legal adviser. Not legal advice.**
>
> Written by DevMSR on 2026-10-25 from what the system does today. Names and approvers are left for the hospital; they are marked "To confirm". Stage 8 of `docs/go-live-checklist.md` tracks it.

## 1. Purpose

DevMSR HMS holds patient records and the hospital's money. This policy says who may have an account, which role each person gets, how accounts are created, changed and removed, and how the list is checked every month.

## 2. Rules

1. **One person, one account.** Nobody signs in as someone else, and accounts are never shared, even at a shared counter computer. Every action in the audit log names the person who did it; a shared login makes that useless.
2. **Only what the job needs.** Each person gets the role for their job and nothing more. A role is a bundle of permissions; the system checks the permissions, never the role's name.
3. **Two people for risky money changes.** The person who asks for a discount, refund, void or package override can never approve it. The system enforces this.
4. **Nobody manages their own access.** The hospital admin cannot change their own roles, deactivate themself or reset their own password from the Users screen. Another admin does it.
5. **Leavers lose access the same day.**
6. **The user list is reviewed every month.**

## 3. Roles

The roles below are set up in the system (from `CLAUDE.md` section 8 and `apps/api/src/auth/permission-matrix.ts`). The hospital fills in the last column (question AD-2 in `docs/hospital-questions.md`).

| Role | Can | Cannot | Given to (designations) |
| --- | --- | --- | --- |
| Hospital admin | Staff users and roles, masters (departments, doctors, wards, beds), hospital settings, view rates, view the audit log | Approve discounts, refunds or voids; change rates; change their own access | To confirm |
| MD or owner | All reports including profit, every refund approval, discounts above the finance limit, voids, Tally export, view billing, view the audit log | Change users, masters or rates | To confirm |
| Finance head or accountant | Rates and cost rates, collection reports, Tally export, view billing. With slice 3b: approve discounts up to the hospital's limit and credit notes | Approve refunds (MD only); edit issued bills (nobody can) | To confirm |
| Billing clerk | Post charges, prepare and issue bills, request discounts, view patients and billing | Approve discounts, refunds or voids; take payments | To confirm |
| Cashier | Take payments and deposits, open and close their own cash shift, request refunds, view patients and billing | See or close other cashiers' shifts; approve anything | To confirm |
| Receptionist | Register and edit patients, appointments and tokens, admit patients, view beds and rates | Change charges or bills | To confirm |
| Doctor | Own queue, consultation notes and orders, mark fit for discharge, view patients | Billing, settings | To confirm |
| Nurse | Ward and bed view, bed status, vitals, return unused medicines, view patients | Billing, settings | To confirm |
| Pharmacist, lab technician, OT coordinator | Their own department (phases 2 and 3) | Other departments | To confirm when those phases start |

Every role can also see the masters every screen needs (departments, doctors, wards) and manage its own sign-in.

**Super admin (DevMSR).** This is DevMSR's own platform account for setting up the hospital. It has no hospital permissions and does no daily hospital work. It may open patient records only through break-glass access: a written reason, access that expires after 1 hour, an audit event, and a notice to the hospital admin. **Not built yet** (stage 4). Until it is, DevMSR has no way to open patient records through the app, and any direct database access by DevMSR is limited by the data processing agreement (`docs/drafts/data-processing-agreement-outline.md`).

**More than one role.** A person may hold more than one role only with the MD's written approval, and never a combination that lets them both request and approve the same kind of change. **To confirm with the hospital:** whether any such combinations are needed (for example a billing clerk who also covers the cash counter).

**Custom roles.** The hospital admin will later be able to build custom roles from permissions. **Not built yet.** Each custom role needs the MD's approval and is recorded in this policy.

## 4. Getting an account

1. The head of department asks for an account in writing (form in section 9): the person's name, designation, department, start date and the role needed.
2. **To confirm (AD-2):** who approves the request.
3. The hospital admin creates the account in Settings, then Users, with the approved role. Usernames are unique and in lower case.
4. The admin sets a first password of at least 10 characters and gives it to the person privately, never by group message or on paper left at a counter.
5. The person changes it at first sign-in. **Not built yet:** the system does not force this yet (stage 4). Until it does, the admin asks the person to tell the admin when they have changed it, and the admin notes it on the form.
6. Hospital admins and accountants also set up two-factor login with an authenticator app. **Not built yet** (stage 4); required before go-live.
7. The admin files the signed form.

The system records who created the account, when, and with which roles in the audit log.

## 5. Changing a role

When someone changes job, the head of department asks for the new role in writing, with the same approval as a new account. The admin removes the old role at the same time as adding the new one: people collect access over the years if old roles are left on.

## 6. Leavers, suspensions and long leave

- **On the last working day, or immediately on suspension or dismissal,** the admin deactivates the account in Settings, then Users. Deactivating ends all of that person's sessions at once. **To confirm (AD-3):** how the admin is told on the same day.
- Accounts are deactivated, never deleted. Bills, receipts and audit events point to the person who made them, and those records are kept.
- **Long leave** (to confirm the number of days with the hospital): deactivate, and reactivate on return.
- If a leaver may know another person's password, or a shared counter password was ever used, reset those passwords too.

## 7. Day-to-day rules for staff

- Sign out when leaving a shared counter computer. The system also signs a person out after 15 minutes without use and after 12 hours in any case, and closing the browser ends the session.
- Never write a password down where others can see it, and never tell it to anyone, including the admin and DevMSR.
- Five wrong passwords in a row lock the account for 15 minutes. Ask the admin if it stays locked: setting a new password unlocks it.
- Report a lost phone with the authenticator app, or a password someone else may know, to the admin at once. The admin follows `docs/drafts/incident-response-plan.md` if it may have been misused.

## 8. Monthly user review

Once a month, **to confirm (AD-4):** who prepares the review and who signs it.

1. Open Settings, then Users, with "show inactive" switched off. The list shows each user's roles, whether they are active and when they last signed in.
2. For each active user check:
   - they still work at the hospital;
   - their role still matches their job;
   - they have signed in recently. An account unused for a long time (to confirm how long) is deactivated until needed.
3. Check that the number of hospital admins, MD and finance accounts is as small as it can be.
4. Check that nobody holds a combination of roles that the MD has not approved.
5. Deactivate or correct anything wrong the same day.
6. Sign and date the review sheet (section 10) and file it.

**To confirm with DevMSR:** the audit log and login history are recorded, but there is no screen yet to read them. Until there is, DevMSR provides a monthly extract of user changes, failed logins and locked accounts for the review.

## 9. Account request form

| Field | Entry |
| --- | --- |
| Request type | New account / role change / deactivation |
| Full name | |
| Designation and department | |
| Start date or last working day | |
| Role or roles needed | |
| Reason, if more than one role | |
| Requested by (head of department), date | |
| Approved by, date | |
| Done by (hospital admin), date and time | |
| First password changed by the user (admin's initials) | |
| Two-factor set up (for admin and finance roles) | |

## 10. Monthly review sheet

| Month | |
| --- | --- |
| Active users at start | |
| Accounts deactivated | |
| Roles changed | |
| Accounts locked or with failed logins to look into | |
| Exceptions approved by the MD | |
| Reviewed by, date | |
| Signed off by, date | |

## 11. Open points

For the hospital (questions AD-2, AD-3 and AD-4 in `docs/hospital-questions.md`):

- Designations for each role, and who approves requests.
- How the admin learns about leavers the same day.
- Who prepares and signs the monthly review.
- How many days of leave, and how long without sign-in, before an account is deactivated.
- Whether any person needs two roles, and which.

For the legal adviser:

- How long account forms and review sheets must be kept.
- Whether staff must sign a confidentiality undertaking before getting an account.

For DevMSR, before go-live:

- Forced password change at first sign-in, and two-factor login (stage 4).
- Break-glass access for the super admin (stage 4).
- A screen or monthly extract for the audit log and login history.
- With slice 3b: discount and credit note approval for the finance role.
