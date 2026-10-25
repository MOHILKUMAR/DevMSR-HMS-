import { Injectable } from '@nestjs/common';
import type { GuardianRelation, Prisma, Sex } from '../generated/prisma/client.js';
import { fromDateOnly } from '../common/dates.js';
import { pageArgs, type PageRequest } from '../common/http/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';
import type { SearchTerm } from './patient-rules.js';

const SUMMARY_SELECT = {
  id: true,
  uhid: true,
  fullName: true,
  sex: true,
  dateOfBirth: true,
  dateOfBirthEstimated: true,
  phone: true,
} as const satisfies Prisma.PatientSelect;
export type PatientSummaryRow = Prisma.PatientGetPayload<{ select: typeof SUMMARY_SELECT }>;

const PATIENT_SELECT = {
  ...SUMMARY_SELECT,
  addressLine: true,
  city: true,
  state: true,
  pincode: true,
  guardianRelation: true,
  guardianName: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  aadhaarLast4: true,
  abhaNumberLast4: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.PatientSelect;
export type PatientRow = Prisma.PatientGetPayload<{ select: typeof PATIENT_SELECT }>;

const CANDIDATE_SELECT = { ...SUMMARY_SELECT, aadhaarBlindIndex: true, abhaNumberBlindIndex: true } as const satisfies Prisma.PatientSelect;
export type CandidateRow = Prisma.PatientGetPayload<{ select: typeof CANDIDATE_SELECT }>;

/** Encrypted Aadhaar or ABHA columns: all set, or all null to clear the number. */
export interface ProtectedColumns {
  encrypted: string | null;
  last4: string | null;
  blindIndex: string | null;
}

export interface PatientData {
  fullName?: string;
  sex?: Sex;
  dateOfBirth?: string;
  dateOfBirthEstimated?: boolean;
  phone?: string;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  guardianRelation?: GuardianRelation | null;
  guardianName?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  aadhaar?: ProtectedColumns;
  abhaNumber?: ProtectedColumns;
}

function toColumns(data: PatientData): Prisma.PatientUncheckedUpdateInput {
  const { dateOfBirth, aadhaar, abhaNumber, ...plain } = data;
  return {
    ...plain,
    ...(dateOfBirth === undefined ? {} : { dateOfBirth: fromDateOnly(dateOfBirth) }),
    ...(aadhaar === undefined
      ? {}
      : { aadhaarEncrypted: aadhaar.encrypted, aadhaarLast4: aadhaar.last4, aadhaarBlindIndex: aadhaar.blindIndex }),
    ...(abhaNumber === undefined
      ? {}
      : { abhaNumberEncrypted: abhaNumber.encrypted, abhaNumberLast4: abhaNumber.last4, abhaNumberBlindIndex: abhaNumber.blindIndex }),
  };
}

function searchCondition(term: SearchTerm): Prisma.PatientWhereInput {
  switch (term.by) {
    case 'uhid':
      return { uhid: term.value };
    case 'uhid_number':
      return { uhid: { endsWith: `-${term.value}` } };
    case 'phone':
      return { phone: term.value };
    case 'aadhaar':
      return { aadhaarBlindIndex: term.value };
    case 'abha':
      return { abhaNumberBlindIndex: term.value };
    case 'name':
      return { fullName: { contains: term.value, mode: 'insensitive' } };
  }
}

/** Patients of one hospital. Every query filters by hospital_id. */
@Injectable()
export class PatientsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `terms` with Aadhaar and ABHA values already turned into blind indexes. */
  async search(hospitalId: string, terms: readonly SearchTerm[], page: PageRequest): Promise<{ rows: PatientSummaryRow[]; total: number }> {
    const where: Prisma.PatientWhereInput = { hospitalId, OR: terms.map(searchCondition) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({ where, select: SUMMARY_SELECT, orderBy: [{ fullName: 'asc' }, { uhid: 'asc' }], ...pageArgs(page) }),
      this.prisma.patient.count({ where }),
    ]);
    return { rows, total };
  }

  findById(hospitalId: string, id: string, tx?: Tx): Promise<PatientRow | null> {
    return (tx ?? this.prisma).patient.findFirst({ where: { id, hospitalId }, select: PATIENT_SELECT });
  }

  async userName(hospitalId: string, userId: string | null): Promise<string | null> {
    if (userId === null) return null;
    const user = await this.prisma.user.findFirst({ where: { id: userId, hospitalId }, select: { displayName: true } });
    return user?.displayName ?? null;
  }

  /**
   * Patients who share an Aadhaar or ABHA number, the mobile, or the name with a birth year within
   * one year. The caller works out which of these it is.
   */
  findDuplicateCandidates(
    hospitalId: string,
    probe: { fullName: string; birthYear: number | null; phone: string | null; aadhaarIndex: string | null; abhaIndex: string | null },
    excludeId?: string,
  ): Promise<CandidateRow[]> {
    const or: Prisma.PatientWhereInput[] = [];
    if (probe.aadhaarIndex !== null) or.push({ aadhaarBlindIndex: probe.aadhaarIndex });
    if (probe.abhaIndex !== null) or.push({ abhaNumberBlindIndex: probe.abhaIndex });
    if (probe.phone !== null) or.push({ phone: probe.phone });
    if (probe.birthYear !== null) {
      or.push({
        fullName: { equals: probe.fullName, mode: 'insensitive' },
        dateOfBirth: { gte: fromDateOnly(`${String(probe.birthYear - 1)}-01-01`), lte: fromDateOnly(`${String(probe.birthYear + 1)}-12-31`) },
      });
    }
    if (or.length === 0) return Promise.resolve([]);
    return this.prisma.patient.findMany({
      where: { hospitalId, OR: or, ...(excludeId === undefined ? {} : { NOT: { id: excludeId } }) },
      select: CANDIDATE_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  create(hospitalId: string, uhid: string, createdById: string, data: PatientData, tx: Tx): Promise<PatientRow> {
    return tx.patient.create({
      data: { ...(toColumns(data) as Prisma.PatientUncheckedCreateInput), hospitalId, uhid, createdById, updatedById: createdById },
      select: PATIENT_SELECT,
    });
  }

  update(hospitalId: string, id: string, updatedById: string, data: PatientData, tx: Tx): Promise<PatientRow> {
    return tx.patient.update({ where: { id, hospitalId }, data: { ...toColumns(data), updatedById }, select: PATIENT_SELECT });
  }
}
