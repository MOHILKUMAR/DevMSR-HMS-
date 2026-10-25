import { Injectable } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import type {
  Admission,
  AdmissionAdvisedList,
  AdmissionListQuery,
  AdmissionSummary,
  Admit,
  BedBoard,
  InterimBill,
  MinimumAdvance,
  RoomCategoryAdvance,
  SetBedStatus,
  Transfer,
} from '@devmsr/validation';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { BillingRepository } from '../billing/billing.repository.js';
import { paise, toBilledPatient, toIssuer } from '../billing/dto/billing.mapper.js';
import { billAmounts } from '../billing/money.js';
import { addDays, toDateOnly, todayIst } from '../common/dates.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { hospitalOf } from '../common/http/hospital-scope.js';
import { paged } from '../common/http/pagination.js';
import type { Tx } from '../common/prisma/tx.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import { Prisma } from '../generated/prisma/client.js';
import { NumberingService } from '../numbering/numbering.service.js';
import { toAdmission, toAdmissionSummary } from './dto/ipd.mapper.js';
import { IpdRepository, type AdmissionRow, type BedPlaceRow } from './ipd.repository.js';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class IpdService {
  constructor(
    private readonly ipd: IpdRepository,
    private readonly billing: BillingRepository,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  private async view(hospitalId: string, row: AdmissionRow): Promise<Admission> {
    const [daily, names] = await Promise.all([this.ipd.dailyCharges(hospitalId, row.id), this.billing.userNames(hospitalId, [row.admittedById])]);
    return toAdmission(row, daily, names);
  }

  /**
   * A bed a patient can go into: free, active, in an active ward that has a room category (which sets
   * the room and nursing charges). Locked until the transaction ends.
   */
  private async freeBed(hospitalId: string, bedId: string, tx: Tx): Promise<BedPlaceRow & { roomCategory: NonNullable<BedPlaceRow['ward']['roomCategory']> }> {
    const bed = await this.ipd.lockBed(hospitalId, bedId, tx);
    if (bed === null) throw Errors.notFound('bed');
    if (!bed.isActive || !bed.ward.isActive || bed.status !== 'free') throw Errors.bedTaken();
    const roomCategory = bed.ward.roomCategory;
    if (roomCategory === null) throw Errors.referenceInvalid('room category of the ward');
    return { ...bed, roomCategory };
  }

  /**
   * Admits a patient into a free bed, with the next admission number of the financial year. When the
   * deposit held is below the room category's minimum advance, the admission goes ahead with a warning
   * (docs/billing-rules.md): both amounts are kept on the admission.
   */
  async admit(auth: AuthContext, input: Admit, meta: RequestMeta, now: Date = new Date()): Promise<Admission> {
    const hospitalId = hospitalOf(auth);
    if ((await this.billing.findPatient(hospitalId, input.patientId)) === null) throw Errors.notFound('patient');
    if ((await this.ipd.activeDoctor(hospitalId, input.doctorId)) === null) throw Errors.referenceInvalid('doctor');
    if (input.opdVisitId !== undefined && (await this.ipd.advisedVisit(hospitalId, input.opdVisitId, input.patientId)) === null) {
      throw Errors.referenceInvalid('OPD visit');
    }
    try {
      const id = await this.transactions.run(async (tx) => {
        if ((await this.ipd.openAdmissionCount(hospitalId, input.patientId, tx)) > 0) throw Errors.alreadyAdmitted();
        const bed = await this.freeBed(hospitalId, input.bedId, tx);
        const held = await this.ipd.depositHeld(hospitalId, input.patientId, tx);
        const { number, financialYear } = await this.numbering.nextDocumentNumber(hospitalId, 'admission', tx, now);
        const admission = await this.ipd.createAdmission(
          {
            hospitalId,
            patientId: input.patientId,
            number,
            financialYear,
            doctorId: input.doctorId,
            opdVisitId: input.opdVisitId ?? null,
            reason: input.reason ?? null,
            admittedAt: now,
            admittedById: auth.userId,
            minimumAdvancePaise: bed.roomCategory.minimumAdvancePaise,
            depositHeldPaise: held,
          },
          tx,
        );
        await this.ipd.createAssignment(hospitalId, { admissionId: admission.id, bedId: bed.id, startedAt: now, createdById: auth.userId }, tx);
        await this.ipd.setBedStatus(bed.id, 'occupied', tx);
        await this.audit.record(
          {
            action: 'ipd.patient.admitted',
            hospitalId,
            actorUserId: auth.userId,
            entityType: 'admission',
            entityId: admission.id,
            meta,
            details: {
              number,
              bedId: bed.id,
              patientId: input.patientId,
              minimumAdvancePaise: paise(bed.roomCategory.minimumAdvancePaise),
              depositHeldPaise: paise(held),
            },
          },
          tx,
        );
        return admission.id;
      });
      return await this.get(auth, id);
    } catch (error) {
      // Two admissions at once: the database's one-open-admission and one-patient-per-bed keys decide.
      if (isUniqueViolation(error)) throw Errors.bedTaken();
      throw error;
    }
  }

  async list(auth: AuthContext, query: AdmissionListQuery): Promise<Paginated<AdmissionSummary>> {
    const hospitalId = hospitalOf(auth);
    const { rows, total } = await this.ipd.listAdmissions(hospitalId, query, query);
    return paged(rows.map(toAdmissionSummary), total, query);
  }

  async get(auth: AuthContext, id: string): Promise<Admission> {
    const hospitalId = hospitalOf(auth);
    const row = await this.ipd.findAdmission(hospitalId, id);
    if (row === null) throw Errors.notFound('admission');
    return this.view(hospitalId, row);
  }

  /** Moves an admitted patient to another free bed. The old bed goes to cleaning. */
  async transfer(auth: AuthContext, id: string, input: Transfer, meta: RequestMeta, now: Date = new Date()): Promise<Admission> {
    const hospitalId = hospitalOf(auth);
    try {
      await this.transactions.run(async (tx) => {
        const admission = await this.ipd.lockAdmission(hospitalId, id, tx);
        if (admission === null) throw Errors.notFound('admission');
        if (admission.status !== 'admitted') throw Errors.admissionState();
        const current = admission.assignments.find((assignment) => assignment.endedAt === null);
        if (current === undefined) throw Errors.admissionState();
        if (current.bedId === input.bedId) throw Errors.bedTaken();
        const bed = await this.freeBed(hospitalId, input.bedId, tx);
        await this.ipd.endAssignment(current.id, { endedAt: now, endReason: 'transfer', endedById: auth.userId }, tx);
        await this.ipd.setBedStatus(current.bedId, 'cleaning', tx);
        await this.ipd.createAssignment(hospitalId, { admissionId: id, bedId: bed.id, startedAt: now, createdById: auth.userId }, tx);
        await this.ipd.setBedStatus(bed.id, 'occupied', tx);
        await this.audit.record(
          {
            action: 'ipd.patient.transferred',
            hospitalId,
            actorUserId: auth.userId,
            entityType: 'admission',
            entityId: id,
            meta,
            details: { fromBedId: current.bedId, toBedId: bed.id },
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw Errors.bedTaken();
      throw error;
    }
    return this.get(auth, id);
  }

  /** Sets a bed free, cleaning, reserved or blocked. An occupied bed changes only by transfer or discharge. */
  async setBedStatus(auth: AuthContext, bedId: string, input: SetBedStatus, meta: RequestMeta): Promise<void> {
    const hospitalId = hospitalOf(auth);
    await this.transactions.run(async (tx) => {
      const bed = await this.ipd.lockBed(hospitalId, bedId, tx);
      if (bed === null) throw Errors.notFound('bed');
      if (bed.status === 'occupied') throw Errors.bedOccupied();
      await this.ipd.setBedStatus(bedId, input.status, tx);
      await this.audit.record(
        { action: 'beds.bed.status-changed', hospitalId, actorUserId: auth.userId, entityType: 'bed', entityId: bedId, meta, details: { from: bed.status, to: input.status } },
        tx,
      );
    });
  }

  async bedBoard(auth: AuthContext): Promise<BedBoard> {
    const wards = await this.ipd.bedBoard(hospitalOf(auth));
    return {
      wards: wards.map((ward) => ({
        id: ward.id,
        code: ward.code,
        name: ward.name,
        roomCategory: ward.roomCategory === null ? null : { ...ward.roomCategory, minimumAdvancePaise: paise(ward.roomCategory.minimumAdvancePaise) },
        beds: ward.beds.map((bed) => {
          const held = bed.assignments[0]?.admission;
          return {
            id: bed.id,
            code: bed.code,
            status: bed.status,
            occupant: held === undefined ? null : { admissionId: held.id, admissionNumber: held.number, patientName: held.patient.fullName, uhid: held.patient.uhid },
          };
        }),
      })),
    };
  }

  /** OPD visits of the last 7 days where the doctor advised admission and none has followed yet. */
  async admissionAdvised(auth: AuthContext, now: Date = new Date()): Promise<AdmissionAdvisedList> {
    const rows = await this.ipd.admissionAdvised(hospitalOf(auth), addDays(todayIst(now), -7));
    return { data: rows.map((row) => ({ visitId: row.id, visitDate: toDateOnly(row.visitDate), patient: row.patient, doctor: row.doctor, diagnosis: row.diagnosis })) };
  }

  async advances(auth: AuthContext): Promise<{ data: RoomCategoryAdvance[] }> {
    const rows = await this.ipd.roomCategoryAdvances(hospitalOf(auth));
    return { data: rows.map((row) => ({ ...row, minimumAdvancePaise: paise(row.minimumAdvancePaise) })) };
  }

  /** Finance sets the advance expected for a room category. */
  async setMinimumAdvance(auth: AuthContext, id: string, input: MinimumAdvance, meta: RequestMeta): Promise<{ data: RoomCategoryAdvance[] }> {
    const hospitalId = hospitalOf(auth);
    if ((await this.ipd.setMinimumAdvance(hospitalId, id, BigInt(input.minimumAdvancePaise))) === 0) throw Errors.notFound('room category');
    await this.audit.record({
      action: 'ipd.minimum-advance.set',
      hospitalId,
      actorUserId: auth.userId,
      entityType: 'room_category',
      entityId: id,
      meta,
      details: { minimumAdvancePaise: input.minimumAdvancePaise },
    });
    return this.advances(auth);
  }

  /**
   * What the stay has come to so far: the patient's charges since admission that are not on an issued
   * bill, totalled like a bill but without a number. Audited like a bill view.
   */
  async interimBill(auth: AuthContext, id: string, meta: RequestMeta, now: Date = new Date()): Promise<InterimBill> {
    const hospitalId = hospitalOf(auth);
    const admission = await this.ipd.findAdmission(hospitalId, id);
    if (admission === null) throw Errors.notFound('admission');
    const [charges, patient, issuer, held] = await Promise.all([
      this.ipd.stayCharges(hospitalId, admission.patientId, admission.admittedAt),
      this.billing.findPatient(hospitalId, admission.patientId),
      this.billing.issuer(hospitalId),
      this.ipd.depositHeld(hospitalId, admission.patientId),
    ]);
    if (patient === null) throw Errors.notFound('admission');
    const bill = billAmounts(charges.map((charge) => ({ unitRatePaise: charge.unitRatePaise, quantity: charge.quantity, taxRateBp: charge.taxRateBp })));
    await this.audit.record({ action: 'ipd.interim-bill.viewed', hospitalId, actorUserId: auth.userId, entityType: 'admission', entityId: id, meta });
    return {
      admissionId: id,
      admissionNumber: admission.number,
      issuer: toIssuer(issuer),
      patient: toBilledPatient(patient),
      admittedAt: admission.admittedAt.toISOString(),
      generatedAt: now.toISOString(),
      lines: charges.map((charge, index) => ({
        description: charge.description,
        serviceDate: toDateOnly(charge.serviceDate),
        quantity: charge.quantity,
        unitRatePaise: paise(charge.unitRatePaise),
        taxRateBp: charge.taxRateBp,
        amountPaise: paise(charge.amountPaise),
        totalPaise: paise(bill.lines[index]?.totalPaise ?? 0n),
      })),
      subtotalPaise: paise(bill.subtotalPaise),
      cgstPaise: paise(bill.cgstPaise),
      sgstPaise: paise(bill.sgstPaise),
      roundOffPaise: paise(bill.roundOffPaise),
      totalPaise: paise(bill.totalPaise),
      depositHeldPaise: paise(held),
    };
  }
}
