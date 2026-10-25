// k6 load test of the billing counter at peak (go-live checklist stage 7, docs/runbooks/load-test.md).
// Each virtual user is one counter: a billing clerk posts charges, drafts a bill and issues it, and a
// cashier takes payment in full, all at once with the other counters. Some payments and issues are
// sent twice at the same moment with one Idempotency-Key, as a double click would. Afterwards,
// deploy/sql/check-number-series.sql proves the bill and receipt numbers have no gaps or repeats.
//
// Fake demo hospital only (pnpm db:seed): never run it against production.
//
//   k6 run -e BASE_URL=https://api.myhospital-staging.in -e PASSWORD=... tests/load/billing-counter.js
//
// Settings (-e NAME=value):
//   BASE_URL       API origin, without /api/v1 (default http://localhost:4000)
//   PASSWORD       the seeded demo users' password (SEED_USER_PASSWORD); required
//   COUNTERS       counters working at once (default 4)
//   DURATION       how long they work (default 1m)
//   CLERK, CASHIER usernames (default billing, cashier)
//   PATIENTS       how many seeded patients to bill, by UHID number 1..PATIENTS (default 20)
//   THINK_SECONDS  pause between bills at one counter (default 1)
//   SUMMARY_FILE   where to write the counts the workflow compares with the database (default load-summary.json)
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE = `${__ENV.BASE_URL || 'http://localhost:4000'}/api/v1`;
const PASSWORD = __ENV.PASSWORD;
const COUNTERS = Number(__ENV.COUNTERS || 4);
const CLERK = __ENV.CLERK || 'billing';
const CASHIER = __ENV.CASHIER || 'cashier';
const PATIENTS = Number(__ENV.PATIENTS || 20);
const THINK_SECONDS = Number(__ENV.THINK_SECONDS || 1);

export const options = {
  setupTimeout: '10m',
  teardownTimeout: '2m',
  scenarios: {
    counters: {
      executor: 'constant-vus',
      vus: COUNTERS,
      duration: __ENV.DURATION || '1m',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{step:charge}': ['p(95)<800'],
    'http_req_duration{step:draft}': ['p(95)<1000'],
    'http_req_duration{step:issue}': ['p(95)<1000'],
    'http_req_duration{step:pay}': ['p(95)<1000'],
    double_submit_created_twice: ['count==0'],
  },
};

const billsIssued = new Counter('bills_issued');
const receiptsCreated = new Counter('receipts_created');
const doubleSubmits = new Counter('double_submits');
const createdTwice = new Counter('double_submit_created_twice');
const billSeconds = new Trend('bill_to_receipt_seconds', false);
const flowOk = new Rate('counter_flow_ok');

// A 409 (still in progress) or a replayed response is the expected answer to a double submit.
http.setResponseCallback(http.expectedStatuses(200, 201, 409));

// Cookies travel by hand, each request with a throwaway jar: many sessions share one virtual user's
// jar otherwise, and a jar never sends Secure cookies over plain http (CI runs the API without TLS).
const noJar = () => new http.CookieJar();

function keepCookies(response, store) {
  for (const name of Object.keys(response.cookies)) store[name] = response.cookies[name][0].value;
}

function cookieHeader(store) {
  return Object.keys(store)
    .map((name) => `${name}=${store[name]}`)
    .join('; ');
}

/** Signs in once and returns the session's cookies and CSRF token. Waits out the login rate limit. */
function signIn(username) {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const store = {};
    const csrf = http.get(`${BASE}/auth/csrf`, { jar: noJar(), tags: { step: 'login' } });
    keepCookies(csrf, store);
    const login = http.post(`${BASE}/auth/login`, JSON.stringify({ username, password: PASSWORD }), {
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.json('csrfToken'), Cookie: cookieHeader(store) },
      jar: noJar(),
      tags: { step: 'login' },
      responseCallback: http.expectedStatuses(200, 429),
    });
    if (login.status === 200) {
      keepCookies(login, store);
      return { cookie: cookieHeader(store), csrf: login.json('csrfToken') };
    }
    if (login.status !== 429) fail(`login as ${username} failed with ${login.status}`);
    sleep(Number(login.headers['Retry-After'] || 15));
  }
  return fail(`login as ${username} kept hitting the rate limit`);
}

function headers(session, idempotencyKey) {
  const result = { 'Content-Type': 'application/json', Cookie: session.cookie, 'X-CSRF-Token': session.csrf };
  if (idempotencyKey) result['Idempotency-Key'] = idempotencyKey;
  return result;
}

function post(session, path, body, step, idempotencyKey) {
  return http.post(`${BASE}${path}`, body === null ? null : JSON.stringify(body), {
    headers: headers(session, idempotencyKey),
    jar: noJar(),
    tags: { step },
  });
}

/**
 * Sends the same request twice at once with one key, as a double click does. Exactly one may create
 * the record; the other must be a replay of it or a 409 while it is still in progress.
 */
function doubleSubmit(session, path, body, step) {
  const key = crypto.randomUUID();
  const params = { headers: headers(session, key), jar: noJar(), tags: { step } };
  const [first, second] = http.batch([
    ['POST', `${BASE}${path}`, body === null ? null : JSON.stringify(body), params],
    ['POST', `${BASE}${path}`, body === null ? null : JSON.stringify(body), params],
  ]);
  doubleSubmits.add(1);
  const fresh = [first, second].filter((r) => (r.status === 200 || r.status === 201) && r.headers['Idempotent-Replayed'] !== 'true');
  if (fresh.length > 1) createdTwice.add(1);
  check([first, second], { 'double submit: one result, never two': (rs) => fresh.length === 1 && rs.every((r) => r.status !== 422) });
  return fresh[0] || first;
}

export function setup() {
  if (!PASSWORD) fail('set -e PASSWORD to the seeded demo password');
  const health = http.get(`${BASE}/health`);
  if (health.status !== 200) fail(`API not healthy at ${BASE}`);

  const clerks = [];
  const cashiers = [];
  for (let i = 0; i < COUNTERS; i += 1) {
    clerks.push(signIn(CLERK));
    cashiers.push(signIn(CASHIER));
  }

  // One open shift per cashier user; payments from every counter land in it.
  const cashier = cashiers[0];
  const current = http.get(`${BASE}/cash-shifts/current`, { headers: headers(cashier), jar: noJar() });
  if (current.json('shift') === null) {
    const opened = post(cashier, '/cash-shifts', { openingCashPaise: 0 }, 'setup');
    if (opened.status !== 201) fail(`could not open the cash shift (${opened.status})`);
  }

  const items = http.get(`${BASE}/service-items?pageSize=100`, { headers: headers(clerks[0]), jar: noJar() });
  const serviceItemIds = items
    .json('data')
    .filter((item) => item.isActive && item.currentRate !== null && item.currentRate.ratePaise > 0)
    .map((item) => item.id);
  if (serviceItemIds.length === 0) fail('no active service item with a rate');

  const patientIds = [];
  for (let n = 1; n <= PATIENTS; n += 1) {
    const found = post(clerks[0], '/patients/search', { q: String(n), pageSize: 1 }, 'setup');
    const first = found.json('data.0.id');
    if (first) patientIds.push(first);
  }
  if (patientIds.length === 0) fail('no seeded patients found: run pnpm db:seed');

  return { clerks, cashiers, serviceItemIds, patientIds };
}

export default function counter(data) {
  const clerk = data.clerks[(__VU - 1) % data.clerks.length];
  const cashier = data.cashiers[(__VU - 1) % data.cashiers.length];
  const patientId = data.patientIds[(__VU * 7 + __ITER) % data.patientIds.length];
  const started = Date.now();
  let ok = false;

  try {
    // 1 to 3 charges for the patient.
    const chargeIds = [];
    const lines = 1 + (__ITER % 3);
    for (let i = 0; i < lines; i += 1) {
      const serviceItemId = data.serviceItemIds[(__VU + __ITER + i) % data.serviceItemIds.length];
      const charge = post(clerk, `/patients/${patientId}/charges`, { serviceItemId, quantity: 1 }, 'charge', crypto.randomUUID());
      if (!check(charge, { 'charge posted': (r) => r.status === 201 })) return;
      chargeIds.push(charge.json('id'));
    }

    // Draft, then issue. One issue in ten is a double click.
    const draft = post(clerk, '/invoices', { patientId, chargeIds }, 'draft', crypto.randomUUID());
    if (!check(draft, { 'bill drafted': (r) => r.status === 201 })) return;
    const issuePath = `/invoices/${draft.json('id')}/issue`;
    const issued = Math.random() < 0.1
      ? doubleSubmit(clerk, issuePath, null, 'issue')
      : post(clerk, issuePath, null, 'issue', crypto.randomUUID());
    if (!check(issued, { 'bill issued with a number': (r) => r.status === 200 && Boolean(r.json('number')) })) return;
    billsIssued.add(1);

    // Payment in full. One in ten is a double click.
    const payment = { invoiceId: issued.json('id'), mode: __ITER % 2 === 0 ? 'cash' : 'upi', amountPaise: issued.json('duePaise') };
    if (payment.mode === 'upi') payment.reference = `LOAD${Date.now()}`.slice(0, 20);
    const paid = Math.random() < 0.1 ? doubleSubmit(cashier, '/payments', payment, 'pay') : post(cashier, '/payments', payment, 'pay', crypto.randomUUID());
    if (!check(paid, { 'payment receipted': (r) => r.status === 201 && Boolean(r.json('number')) })) return;
    receiptsCreated.add(1);

    billSeconds.add((Date.now() - started) / 1000);
    ok = true;
  } finally {
    flowOk.add(ok);
  }
  sleep(THINK_SECONDS * (0.5 + Math.random()));
}

export function teardown(data) {
  // Close the shift with the expected cash, so a staging run leaves the counter tidy.
  const cashier = data.cashiers[0];
  const current = http.get(`${BASE}/cash-shifts/current`, { headers: headers(cashier), jar: noJar() });
  const shift = current.json('shift');
  if (shift && shift.id) {
    post(cashier, `/cash-shifts/${shift.id}/close`, { countedCashPaise: shift.expectedCashPaise }, 'teardown');
  }
}

export function handleSummary(summary) {
  const count = (name) => (summary.metrics[name] ? summary.metrics[name].values.count : 0);
  const counts = {
    bills_issued: count('bills_issued'),
    receipts_created: count('receipts_created'),
    double_submits: count('double_submits'),
    double_submit_created_twice: count('double_submit_created_twice'),
  };
  return {
    [__ENV.SUMMARY_FILE || 'load-summary.json']: JSON.stringify(counts, null, 2),
    stdout: `\nload test counts: ${JSON.stringify(counts)}\n`,
  };
}
