import { Injectable } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import type {
  DuplicateCheck,
  DuplicateCheckResponse,
  Patient,
  PatientSearch,
  PatientSummary,
  RegisterPatient,
  UpdatePatient,
} from '@devmsr/validation';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { todayIst } from '../common/dates.js';
import { FieldEncryptionService } from '../common/crypto/field-encryption.service.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { hospitalOf } from '../common/http/hospital-scope.js';
import { paged } from '../common/http/pagination.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import { Prisma } from '../generated/prisma/client.js';
import { NumberingService } from '../numbering/numbering.service.js';
import { toDuplicateMatch, toPatient, toPatientSummary } from './dto/patients.mapper.js';
import {
  birthYearOf,
  classifySearch,
  collapseSpaces,
  duplicateReasons,
  estimateDateOfBirth,
  isBlocking,
  type DuplicateProbe,
  type SearchTerm,
} from './patient-rules.js';
import { PatientsRepository, type CandidateRow, type PatientData, type ProtectedColumns } from './patients.repository.js';

const CLEARED: ProtectedColumns = { encrypted: null, last4: null, blindIndex: null };

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function birthFields(input: { dateOfBirth?: string | undefined; ageYears?: number | undefined }, today: string) {
  if (input.dateOfBirth !== undefined) return { dateOfBirth: input.dateOfBirth, dateOfBirthEstimated: false };
  if (input.ageYears !== undefined) return { dateOfBirth: estimateDateOfBirth(today, input.ageYears), dateOfBirthEstimated: true };
  return {};
}

interface SortedMatches {
  blocking: { row: CandidateRow; reasons: ReturnType<typeof duplicateReasons> }[];
  possible: { row: CandidateRow; reasons: ReturnType<typeof duplicateReasons> }[];
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly patients: PatientsRepository,
    private readonly numbering: NumberingService,
    private readonly encryption: FieldEncryptionService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  /** Encrypts an Aadhaar or ABHA number for storage; null clears it, undefined leaves it alone. */
  private protect(field: 'aadhaar' | 'abha_number', value: string | null | undefined): ProtectedColumns | undefined {
    if (value === undefined) return undefined;
    if (value === null) return CLEARED;
    const { encrypted, last4, blindIndex } = this.encryption.protect(field, value);
    return { encrypted, last4, blindIndex };
  }

  private async sortedMatches(hospitalId: string, probe: DuplicateProbe, excludeId?: string): Promise<SortedMatches> {
    const candidates = await this.patients.findDuplicateCandidates(hospitalId, probe, excludeId);
    const sorted: SortedMatches = { blocking: [], possible: [] };
    for (const row of candidates) {
      const reasons = duplicateReasons(row, probe);
      if (reasons.length === 0) continue;
      (isBlocking(reasons) ? sorted.blocking : sorted.possible).push({ row, reasons });
    }
    return sorted;
  }

  private probeOf(
    input: {
      fullName: string;
      dateOfBirth?: string | undefined;
      ageYears?: number | undefined;
      phone?: string | undefined;
      aadhaar?: string | null | undefined;
      abhaNumber?: string | null | undefined;
    },
    today: string,
  ): DuplicateProbe {
    const birth = birthFields(input, today);
    return {
      fullName: collapseSpaces(input.fullName),
      birthYear: birth.dateOfBirth === undefined ? null : birthYearOf(birth.dateOfBirth),
      phone: input.phone ?? null,
      aadhaarIndex: input.aadhaar == null ? null : this.encryption.blindIndex('aadhaar', input.aadhaar),
      abhaIndex: input.abhaNumber == null ? null : this.encryption.blindIndex('abha_number', input.abhaNumber),
    };
  }

  /** Who already looks like this patient, before registering. Same rules as registration itself. */
  async duplicateCheck(auth: AuthContext, input: DuplicateCheck, now: Date = new Date()): Promise<DuplicateCheckResponse> {
    const sorted = await this.sortedMatches(hospitalOf(auth), this.probeOf(input, todayIst(now)));
    return {
      blocking: sorted.blocking.map((match) => toDuplicateMatch(match.row, match.reasons)),
      possible: sorted.possible.map((match) => toDuplicateMatch(match.row, match.reasons)),
    };
  }

  /**
   * Registers a patient and gives them the next UHID. The same Aadhaar or ABHA number is refused;
   * a possible duplicate (mobile, or name and birth year) must be acknowledged first.
   */
  async register(auth: AuthContext, input: RegisterPatient, meta: RequestMeta, now: Date = new Date()): Promise<Patient> {
    const hospitalId = hospitalOf(auth);
    const today = todayIst(now);
    const probe = this.probeOf(input, today);
    const sorted = await this.sortedMatches(hospitalId, probe);
    if (sorted.blocking.length > 0) throw Errors.duplicatePatient(sorted.blocking.map(({ row }) => ({ id: row.id, uhid: row.uhid })));
    const acknowledged = new Set(input.acknowledgedDuplicateIds ?? []);
    const unacknowledged = sorted.possible.filter(({ row }) => !acknowledged.has(row.id));
    if (unacknowledged.length > 0) throw Errors.possibleDuplicate(unacknowledged.map(({ row }) => ({ id: row.id, uhid: row.uhid })));

    const data: PatientData = {
      fullName: probe.fullName,
      sex: input.sex,
      ...birthFields(input, today),
      phone: input.phone,
      addressLine: input.addressLine ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
      guardianRelation: input.guardianRelation ?? null,
      guardianName: input.guardianName ?? null,
      emergencyContactName: input.emergencyContactName ?? null,
      emergencyContactPhone: input.emergencyContactPhone ?? null,
      aadhaar: this.protect('aadhaar', input.aadhaar ?? null),
      abhaNumber: this.protect('abha_number', input.abhaNumber ?? null),
    };

    try {
      const row = await this.transactions.run(async (tx) => {
        const uhid = await this.numbering.nextUhid(hospitalId, tx, now);
        const created = await this.patients.create(hospitalId, uhid, auth.userId, data, tx);
        await this.audit.record(
          {
            action: 'patients.patient.registered',
            hospitalId,
            actorUserId: auth.userId,
            entityType: 'patient',
            entityId: created.id,
            meta,
            // Possible duplicates staff saw and registered past (all of them, by now).
            details: { uhid, acknowledgedDuplicates: sorted.possible.map(({ row }) => row.uhid).join(',') },
          },
          tx,
        );
        return created;
      });
      return toPatient(row, await this.patients.userName(hospitalId, auth.userId));
    } catch (error) {
      // Another registration with the same Aadhaar or ABHA number won the race.
      if (isUniqueViolation(error)) {
        const raced = await this.sortedMatches(hospitalId, { ...probe, phone: null, birthYear: null });
        throw Errors.duplicatePatient(raced.blocking.map(({ row }) => ({ id: row.id, uhid: row.uhid })));
      }
      throw error;
    }
  }

  async search(auth: AuthContext, input: PatientSearch, meta: RequestMeta): Promise<Paginated<PatientSummary>> {
    const hospitalId = hospitalOf(auth);
    const terms: SearchTerm[] = classifySearch(input.q).map((term) => {
      if (term.by === 'aadhaar') return { by: 'aadhaar', value: this.encryption.blindIndex('aadhaar', term.value) };
      if (term.by === 'abha') return { by: 'abha', value: this.encryption.blindIndex('abha_number', term.value) };
      return term;
    });
    const { rows, total } = terms.length === 0 ? { rows: [], total: 0 } : await this.patients.search(hospitalId, terms, input);
    // What was searched for is never stored: only how, and how many records were shown.
    await this.audit.record({
      action: 'patients.patient.searched',
      hospitalId,
      actorUserId: auth.userId,
      entityType: 'patient',
      meta,
      details: { by: [...new Set(terms.map((term) => term.by))].join(','), shown: rows.length },
    });
    return paged(rows.map(toPatientSummary), total, input);
  }

  /** Opens a patient record. Every view is audited. */
  async get(auth: AuthContext, id: string, meta: RequestMeta): Promise<Patient> {
    const hospitalId = hospitalOf(auth);
    const row = await this.patients.findById(hospitalId, id);
    if (row === null) throw Errors.notFound('patient');
    await this.audit.record({ action: 'patients.patient.viewed', hospitalId, actorUserId: auth.userId, entityType: 'patient', entityId: id, meta });
    return toPatient(row, await this.patients.userName(hospitalId, row.createdById));
  }

  /** Edits a patient. The UHID never changes. Changing Aadhaar or ABHA runs the duplicate block again. */
  async update(auth: AuthContext, id: string, input: UpdatePatient, meta: RequestMeta, now: Date = new Date()): Promise<Patient> {
    const hospitalId = hospitalOf(auth);
    const current = await this.patients.findById(hospitalId, id);
    if (current === null) throw Errors.notFound('patient');

    const relation = input.guardianRelation === undefined ? current.guardianRelation : input.guardianRelation;
    const guardian = input.guardianName === undefined ? current.guardianName : input.guardianName;
    if ((relation === null) !== (guardian === null)) {
      throw Errors.validation([{ location: 'body', path: 'guardianName', message: 'Enter both the relation and the guardian name' }]);
    }

    if (input.aadhaar != null || input.abhaNumber != null) {
      const probe: DuplicateProbe = {
        fullName: current.fullName,
        birthYear: null,
        phone: null,
        aadhaarIndex: input.aadhaar == null ? null : this.encryption.blindIndex('aadhaar', input.aadhaar),
        abhaIndex: input.abhaNumber == null ? null : this.encryption.blindIndex('abha_number', input.abhaNumber),
      };
      const sorted = await this.sortedMatches(hospitalId, probe, id);
      if (sorted.blocking.length > 0) throw Errors.duplicatePatient(sorted.blocking.map(({ row }) => ({ id: row.id, uhid: row.uhid })));
    }

    const { aadhaar, abhaNumber, dateOfBirth, ageYears, fullName, ...plain } = input;
    const data: PatientData = {
      ...plain,
      ...(fullName === undefined ? {} : { fullName: collapseSpaces(fullName) }),
      ...birthFields({ dateOfBirth, ageYears }, todayIst(now)),
      aadhaar: this.protect('aadhaar', aadhaar),
      abhaNumber: this.protect('abha_number', abhaNumber),
    };

    try {
      const row = await this.transactions.run(async (tx) => {
        const updated = await this.patients.update(hospitalId, id, auth.userId, data, tx);
        // Which fields were sent, never their values. Fields left out of the body are absent, not undefined.
        const fields = Object.keys(input);
        await this.audit.record(
          { action: 'patients.patient.updated', hospitalId, actorUserId: auth.userId, entityType: 'patient', entityId: id, meta, details: { fields: fields.join(',') } },
          tx,
        );
        return updated;
      });
      return toPatient(row, await this.patients.userName(hospitalId, row.createdById));
    } catch (error) {
      if (isUniqueViolation(error)) throw Errors.duplicatePatient([]);
      throw error;
    }
  }
}
