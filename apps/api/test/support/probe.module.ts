import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Controller, Get, HttpCode, Injectable, Module, Post, Req } from '@nestjs/common';
import { idParamsSchema } from '@devmsr/validation';
import { z } from 'zod';
import { AuditService } from '../../src/audit/audit.service.js';
import type { AuthContext } from '../../src/auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../../src/auth/decorators.js';
import { ApiContract, ValidBody, ValidParams } from '../../src/common/contract/api-contract.js';
import { Errors } from '../../src/common/errors/app-error.js';
import { ReqMeta, type AppRequest, type RequestMeta } from '../../src/common/http/app-request.js';
import { Idempotent } from '../../src/common/idempotency/idempotent.decorator.js';
import { PrismaService } from '../../src/common/prisma/prisma.service.js';

// Test-only routes that exercise pipeline steps no production route uses yet: object-level 404s,
// audit on record views, idempotent financial POSTs and response shaping. Never registered in the app.

const chargeBody = z.object({ amountPaise: z.number().int().positive() });
const chargeResponse = z.object({ id: z.uuid(), amountPaise: z.number().int() });
const patientResponse = z.object({ id: z.uuid(), sex: z.string() });

@Injectable()
export class ProbeState {
  chargesCreated = 0;
}

@Injectable()
class ProbePatientsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(hospitalId: string | null, id: string): Promise<{ id: string; sex: string; fullName: string } | null> {
    if (hospitalId === null) return Promise.resolve(null);
    return this.prisma.patient.findFirst({ where: { id, hospitalId }, select: { id: true, sex: true, fullName: true } });
  }
}

@Controller('test-probes')
class ProbeController {
  constructor(
    private readonly patients: ProbePatientsRepository,
    private readonly audit: AuditService,
    private readonly state: ProbeState,
  ) {}

  @Get('patients/:id')
  @RequirePermission('patients.patient.read')
  @ApiContract({ summary: 'Probe: view a patient', params: idParamsSchema, response: patientResponse })
  async patient(@ValidParams() params: { id: string }, @CurrentAuth() auth: AuthContext, @ReqMeta() meta: RequestMeta): Promise<unknown> {
    const patient = await this.patients.findById(auth.hospitalId, params.id);
    if (patient === null) throw Errors.notFound('patient');
    await this.audit.record({
      action: 'patients.patient.viewed',
      hospitalId: auth.hospitalId,
      actorUserId: auth.userId,
      entityType: 'patient',
      entityId: patient.id,
      meta,
    });
    // fullName is not in the response schema, so the response must not contain it.
    return patient;
  }

  @Post('charges')
  @RequirePermission('billing.charge.create')
  @Idempotent()
  @ApiContract({ summary: 'Probe: post a charge', body: chargeBody, response: chargeResponse })
  async charge(@ValidBody() body: { amountPaise: number }, @Req() req: AppRequest): Promise<unknown> {
    if (req.get('x-probe-fail') === '1') throw Errors.conflict('Probe failure');
    this.state.chargesCreated += 1;
    // Long enough for a parallel duplicate to arrive while this one is in progress.
    await sleep(100);
    return { id: randomUUID(), amountPaise: body.amountPaise, internalNote: 'must be stripped' };
  }

  @Post('no-body')
  @RequirePermission('auth.session.manage-own')
  @HttpCode(204)
  @ApiContract({ summary: 'Probe: a route that takes no body' })
  noBody(): void {
    return undefined;
  }

  @Get('crash')
  @RequirePermission('auth.session.manage-own')
  @ApiContract({ summary: 'Probe: an unexpected error', response: z.object({}) })
  crash(): never {
    throw new Error('connect failed: user=hms password=hunter2 host=db.internal');
  }
}

@Module({
  controllers: [ProbeController],
  providers: [ProbePatientsRepository, ProbeState],
})
export class ProbeModule {}
