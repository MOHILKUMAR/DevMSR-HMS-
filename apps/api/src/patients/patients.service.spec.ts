import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import type { FieldEncryptionService } from '../common/crypto/field-encryption.service.js';
import { AppError } from '../common/errors/app-error.js';
import type { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { NumberingService } from '../numbering/numbering.service.js';
import type { CandidateRow, PatientRow, PatientsRepository } from './patients.repository.js';
import { PatientsService } from './patients.service.js';

const META = { requestId: 'r', ipAddress: null, userAgent: null };
const RECEPTION: AuthContext = { sessionId: 's', userId: 'u1', hospitalId: 'h1', kind: 'staff', permissions: new Set(), expiresAt: new Date(), userHospitalId: 'h1', breakGlass: null };
// 25 Oct 2026, 10:00 IST.
const NOW = new Date('2026-10-25T04:30:00Z');

const ROW: PatientRow = {
  id: 'p1',
  uhid: 'DEMO-2026-000051',
  fullName: 'Ravi Kumar',
  sex: 'male',
  dateOfBirth: new Date('1992-10-25T00:00:00Z'),
  dateOfBirthEstimated: true,
  phone: '+919876543210',
  addressLine: null,
  city: null,
  state: null,
  pincode: null,
  guardianRelation: null,
  guardianName: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  aadhaarLast4: null,
  abhaNumberLast4: null,
  createdById: 'u1',
  createdAt: NOW,
  updatedAt: NOW,
};

function candidate(overrides: Partial<CandidateRow>): CandidateRow {
  return {
    id: 'p0',
    uhid: 'DEMO-2026-000007',
    fullName: 'Someone Else',
    sex: 'female',
    dateOfBirth: new Date('1970-01-01T00:00:00Z'),
    dateOfBirthEstimated: false,
    phone: '+919000000000',
    aadhaarBlindIndex: null,
    abhaNumberBlindIndex: null,
    ...overrides,
  };
}

function setup(candidates: CandidateRow[] = []) {
  const repo = {
    findDuplicateCandidates: vi.fn().mockResolvedValue(candidates),
    create: vi.fn().mockResolvedValue(ROW),
    update: vi.fn().mockResolvedValue(ROW),
    findById: vi.fn().mockResolvedValue(ROW),
    search: vi.fn().mockResolvedValue({ rows: [ROW], total: 1 }),
    userName: vi.fn().mockResolvedValue('Demo Receptionist'),
  };
  const numbering = { nextUhid: vi.fn().mockResolvedValue('DEMO-2026-000051') };
  const encryption = {
    protect: vi.fn((_field: string, value: string) => ({ encrypted: `enc:${value}`, last4: value.slice(-4), blindIndex: `idx:${value}` })),
    blindIndex: vi.fn((_field: string, value: string) => `idx:${value}`),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const transactions = { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) };
  const service = new PatientsService(
    repo as unknown as PatientsRepository,
    numbering as unknown as NumberingService,
    encryption as unknown as FieldEncryptionService,
    audit as unknown as AuditService,
    transactions as unknown as TransactionRunner,
  );
  return { service, repo, numbering, audit };
}

async function errorOf(promise: Promise<unknown>): Promise<AppError> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

const NEW_PATIENT = { fullName: 'Ravi  Kumar', sex: 'male' as const, ageYears: 34, phone: '+919876543210' };

describe('PatientsService.register', () => {
  it('gives the next UHID inside the transaction and audits the registration', async () => {
    const { service, repo, numbering, audit } = setup();
    const patient = await service.register(RECEPTION, NEW_PATIENT, META, NOW);
    expect(patient).toMatchObject({ uhid: 'DEMO-2026-000051', registeredByName: 'Demo Receptionist' });
    expect(numbering.nextUhid).toHaveBeenCalledWith('h1', {}, NOW);
    expect(repo.create).toHaveBeenCalledWith(
      'h1',
      'DEMO-2026-000051',
      'u1',
      expect.objectContaining({ fullName: 'Ravi Kumar', dateOfBirth: '1992-10-25', dateOfBirthEstimated: true }),
      {},
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'patients.patient.registered', entityId: 'p1' }), {});
  });

  it('refuses the same Aadhaar outright, even if acknowledged, and says only which UHID', async () => {
    const aadhaar = '234567890124';
    const { service, repo } = setup([candidate({ aadhaarBlindIndex: `idx:${aadhaar}` })]);
    const error = await errorOf(service.register(RECEPTION, { ...NEW_PATIENT, aadhaar, acknowledgedDuplicateIds: ['p0'] }, META, NOW));
    expect(error.code).toBe('DUPLICATE_PATIENT');
    expect(error.details).toEqual({ matches: [{ id: 'p0', uhid: 'DEMO-2026-000007' }] });
    expect(JSON.stringify(error.details)).not.toContain('Someone');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('asks before registering a possible duplicate, then registers once it is acknowledged', async () => {
    const { service, repo } = setup([candidate({ phone: '+919876543210' })]);
    expect((await errorOf(service.register(RECEPTION, NEW_PATIENT, META, NOW))).code).toBe('POSSIBLE_DUPLICATE');
    expect(repo.create).not.toHaveBeenCalled();
    await service.register(RECEPTION, { ...NEW_PATIENT, acknowledgedDuplicateIds: ['p0'] }, META, NOW);
    expect(repo.create).toHaveBeenCalledTimes(1);
  });
});

describe('PatientsService views, searches and edits', () => {
  it('audits every record view', async () => {
    const { service, audit } = setup();
    await service.get(RECEPTION, 'p1', META);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'patients.patient.viewed', entityId: 'p1' }));
  });

  it('never stores what was searched for, only how', async () => {
    const { service, audit } = setup();
    await service.search(RECEPTION, { q: 'Ravi Kumar', page: 1, pageSize: 50 }, META);
    const entry = audit.record.mock.calls[0]?.[0] as { details: Record<string, unknown> };
    expect(entry.details).toEqual({ by: 'name', shown: 1 });
    expect(JSON.stringify(entry)).not.toContain('Ravi');
  });

  it('refuses a guardian relation without a name, and audits field names but not values', async () => {
    const { service, audit } = setup();
    expect((await errorOf(service.update(RECEPTION, 'p1', { guardianRelation: 'son_of' }, META, NOW))).code).toBe('VALIDATION_FAILED');
    await service.update(RECEPTION, 'p1', { city: 'Pune', guardianRelation: 'son_of', guardianName: 'Mohan Kumar' }, META, NOW);
    const entry = audit.record.mock.calls[0]?.[0] as { details: Record<string, unknown> };
    expect(entry.details).toEqual({ fields: 'city,guardianRelation,guardianName' });
  });

  it('reports a patient of another hospital as 404', async () => {
    const { service, repo } = setup();
    repo.findById.mockResolvedValue(null);
    expect((await errorOf(service.get(RECEPTION, 'p9', META))).code).toBe('NOT_FOUND');
  });
});
