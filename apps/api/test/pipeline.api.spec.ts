import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createHospital, createPatient, createUser, signIn, type SignedInBrowser, type TestHospital } from './support/fixtures.js';
import { ProbeModule, ProbeState } from './support/probe.module.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

describe('request pipeline', () => {
  let t: TestApp;
  let hospital: TestHospital;
  let otherHospital: TestHospital;
  let nurse: SignedInBrowser;
  let admin: SignedInBrowser;
  let clerk: SignedInBrowser;
  let state: ProbeState;

  beforeAll(async () => {
    t = await createTestApp({ imports: [ProbeModule] });
    state = t.app.get(ProbeState);
    hospital = await createHospital(t.prisma);
    otherHospital = await createHospital(t.prisma);
    nurse = await signIn(t, await createUser(t.prisma, hospital, 'nurse'));
    admin = await signIn(t, await createUser(t.prisma, hospital, 'hospital_admin'));
    clerk = await signIn(t, await createUser(t.prisma, hospital, 'billing_clerk'));
  });

  afterAll(async () => {
    await t.close();
  });

  describe('object-level checks', () => {
    it('returns a patient of the user own hospital and audits the view', async () => {
      const patient = await createPatient(t.prisma, hospital.id);
      const response = await as(request(t.http).get(`/api/v1/test-probes/patients/${patient.id}`), nurse);
      expect(response.status).toBe(200);
      const audit = await t.prisma.auditEvent.findMany({ where: { entityId: patient.id, action: 'patients.patient.viewed' } });
      expect(audit).toHaveLength(1);
      expect(audit[0]?.hospitalId).toBe(hospital.id);
    });

    it('returns 404, not 403, for another hospital patient, exactly like a missing one', async () => {
      const foreign = await createPatient(t.prisma, otherHospital.id);
      const other = await as(request(t.http).get(`/api/v1/test-probes/patients/${foreign.id}`), nurse);
      const missing = await as(request(t.http).get(`/api/v1/test-probes/patients/${randomUUID()}`), nurse);
      expect(other.status).toBe(404);
      expect(other.body).toEqual(missing.body);
      expect(await t.prisma.auditEvent.count({ where: { entityId: foreign.id } })).toBe(0);
    });

    it('returns 403 when the role lacks the permission', async () => {
      const patient = await createPatient(t.prisma, hospital.id);
      const response = await as(request(t.http).get(`/api/v1/test-probes/patients/${patient.id}`), admin);
      expect(response.status).toBe(403);
      expect((response.body as ErrorBody).error.code).toBe('PERMISSION_DENIED');
    });

    it('returns 400 for an ID that is not a UUID', async () => {
      const response = await as(request(t.http).get('/api/v1/test-probes/patients/123'), nurse);
      expect(response.status).toBe(400);
      expect((response.body as ErrorBody).error.details).toEqual([expect.objectContaining({ location: 'params', path: 'id' })]);
    });
  });

  describe('response shape', () => {
    it('sends only the fields in the response schema', async () => {
      const patient = await createPatient(t.prisma, hospital.id);
      const response = await as(request(t.http).get(`/api/v1/test-probes/patients/${patient.id}`), nurse);
      expect(Object.keys(response.body as object).sort()).toEqual(['id', 'sex']);
    });
  });

  describe('idempotency', () => {
    const charge = (browser: SignedInBrowser, key: string | undefined, body: unknown = { amountPaise: 15_000 }) => {
      const req = as(request(t.http).post('/api/v1/test-probes/charges'), browser);
      return (key === undefined ? req : req.set('Idempotency-Key', key)).send(body as object);
    };

    it('requires an Idempotency-Key header', async () => {
      const response = await charge(clerk, undefined);
      expect(response.status).toBe(400);
      expect((response.body as ErrorBody).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('replays the stored response for a repeated request instead of running it again', async () => {
      const key = randomUUID();
      const before = state.chargesCreated;
      const first = await charge(clerk, key);
      const second = await charge(clerk, key);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(state.chargesCreated - before).toBe(1);
      expect(Object.keys(first.body as object).sort()).toEqual(['amountPaise', 'id']);
    });

    it('rejects the same key with a different body', async () => {
      const key = randomUUID();
      await charge(clerk, key, { amountPaise: 100 }).expect(201);
      const response = await charge(clerk, key, { amountPaise: 200 });
      expect(response.status).toBe(422);
      expect((response.body as ErrorBody).error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('runs a double submit only once', async () => {
      const key = randomUUID();
      const before = state.chargesCreated;
      const responses = await Promise.all([charge(clerk, key), charge(clerk, key)]);
      expect(state.chargesCreated - before).toBe(1);
      expect(responses.map((r) => r.status).filter((s) => s === 201).length).toBeGreaterThanOrEqual(1);
      for (const r of responses) {
        expect([201, 409]).toContain(r.status);
      }
    });

    it('frees the key when the handler fails, so the client can retry', async () => {
      const key = randomUUID();
      const failed = await charge(clerk, key).set('X-Probe-Fail', '1');
      expect(failed.status).toBe(409);
      const retried = await charge(clerk, key);
      expect(retried.status).toBe(201);
      expect(retried.headers['idempotent-replayed']).toBeUndefined();
    });

    it('scopes keys to the user who sent them', async () => {
      const key = randomUUID();
      const colleague = await signIn(t, await createUser(t.prisma, hospital, 'billing_clerk'));
      const mine = await charge(clerk, key);
      const theirs = await charge(colleague, key);
      expect(theirs.status).toBe(201);
      expect(theirs.headers['idempotent-replayed']).toBeUndefined();
      expect(theirs.body).not.toEqual(mine.body);
    });
  });

  describe('input and errors', () => {
    it('rejects a body on a route that takes none', async () => {
      const response = await as(request(t.http).post('/api/v1/test-probes/no-body'), nurse).send({ unexpected: true });
      expect(response.status).toBe(400);
      expect(await as(request(t.http).post('/api/v1/test-probes/no-body'), nurse).then((r) => r.status)).toBe(204);
    });

    it('turns an unexpected error into a generic 500 without leaking its message', async () => {
      const response = await as(request(t.http).get('/api/v1/test-probes/crash'), nurse);
      expect(response.status).toBe(500);
      expect((response.body as ErrorBody).error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(response.body)).not.toMatch(/hunter2|password|db\.internal|at |\.ts/);
    });
  });
});
