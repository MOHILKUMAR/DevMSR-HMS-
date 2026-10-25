import { Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import {
  admissionAdvisedListSchema,
  admissionListQuerySchema,
  admissionListSchema,
  admissionSchema,
  admitSchema,
  bedBoardSchema,
  idParamsSchema,
  interimBillSchema,
  minimumAdvanceSchema,
  roomCategoryAdvanceListSchema,
  setBedStatusSchema,
  transferSchema,
  type Admission,
  type AdmissionAdvisedList,
  type AdmissionListQuery,
  type AdmissionSummary,
  type Admit,
  type BedBoard,
  type InterimBill,
  type MinimumAdvance,
  type RoomCategoryAdvance,
  type SetBedStatus,
  type Transfer,
} from '@devmsr/validation';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../auth/decorators.js';
import { ApiContract, ValidBody, ValidParams, ValidQuery } from '../common/contract/api-contract.js';
import { ReqMeta, type RequestMeta } from '../common/http/app-request.js';
import { Idempotent } from '../common/idempotency/idempotent.decorator.js';
import { IpdService } from './ipd.service.js';

/** Admissions, transfers and the interim bill. */
@Controller('admissions')
export class AdmissionsController {
  constructor(private readonly ipd: IpdService) {}

  @Post()
  @Idempotent()
  @RequirePermission('ipd.admission.create')
  @ApiContract({ summary: 'Admit a patient into a free bed, with the next admission number', body: admitSchema, response: admissionSchema })
  admit(@CurrentAuth() auth: AuthContext, @ValidBody() body: Admit, @ReqMeta() meta: RequestMeta): Promise<Admission> {
    return this.ipd.admit(auth, body, meta);
  }

  @Get()
  @RequirePermission('ipd.admission.read')
  @ApiContract({ summary: 'Admissions, newest first. ?status=admitted for the patients in now', query: admissionListQuerySchema, response: admissionListSchema })
  list(@CurrentAuth() auth: AuthContext, @ValidQuery() query: AdmissionListQuery): Promise<Paginated<AdmissionSummary>> {
    return this.ipd.list(auth, query);
  }

  // Before ':id', so "advised" is never read as an id.
  @Get('advised')
  @RequirePermission('ipd.admission.read')
  @ApiContract({ summary: 'OPD visits of the last 7 days where admission was advised and none followed', response: admissionAdvisedListSchema })
  advised(@CurrentAuth() auth: AuthContext): Promise<AdmissionAdvisedList> {
    return this.ipd.admissionAdvised(auth);
  }

  @Get(':id')
  @RequirePermission('ipd.admission.read')
  @ApiContract({ summary: 'One admission with its beds and the room and nursing charges posted', params: idParamsSchema, response: admissionSchema })
  get(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }): Promise<Admission> {
    return this.ipd.get(auth, params.id);
  }

  @Post(':id/transfers')
  @RequirePermission('ipd.transfer.create')
  @ApiContract({ summary: 'Move the patient to another free bed; the old bed goes to cleaning', params: idParamsSchema, body: transferSchema, response: admissionSchema })
  transfer(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: Transfer, @ReqMeta() meta: RequestMeta): Promise<Admission> {
    return this.ipd.transfer(auth, params.id, body, meta);
  }

  @Get(':id/interim-bill')
  @RequirePermission('billing.account.read')
  @ApiContract({ summary: 'What the stay has come to so far, without a bill number (audited)', params: idParamsSchema, response: interimBillSchema })
  interimBill(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<InterimBill> {
    return this.ipd.interimBill(auth, params.id, meta);
  }
}

/** The bed board and bed states set by hand. */
@Controller()
export class BedBoardController {
  constructor(private readonly ipd: IpdService) {}

  @Get('bed-board')
  @RequirePermission('beds.bed.read')
  @ApiContract({ summary: 'Every active ward with its beds, their state and who is in them', response: bedBoardSchema })
  bedBoard(@CurrentAuth() auth: AuthContext): Promise<BedBoard> {
    return this.ipd.bedBoard(auth);
  }

  @Put('beds/:id/status')
  @HttpCode(204)
  @RequirePermission('beds.bed.update-status')
  @ApiContract({ summary: 'Set a bed free, cleaning, reserved or blocked; an occupied bed is refused', params: idParamsSchema, body: setBedStatusSchema })
  async setStatus(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: SetBedStatus, @ReqMeta() meta: RequestMeta): Promise<void> {
    await this.ipd.setBedStatus(auth, params.id, body, meta);
  }

  @Get('room-categories/minimum-advances')
  @RequirePermission('masters.data.read')
  @ApiContract({ summary: "Each room category's minimum advance at admission", response: roomCategoryAdvanceListSchema })
  advances(@CurrentAuth() auth: AuthContext): Promise<{ data: RoomCategoryAdvance[] }> {
    return this.ipd.advances(auth);
  }

  @Put('room-categories/:id/minimum-advance')
  @RequirePermission('tariffs.tariff.manage')
  @ApiContract({ summary: 'Set the minimum advance of a room category', params: idParamsSchema, body: minimumAdvanceSchema, response: roomCategoryAdvanceListSchema })
  setAdvance(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: MinimumAdvance,
    @ReqMeta() meta: RequestMeta,
  ): Promise<{ data: RoomCategoryAdvance[] }> {
    return this.ipd.setMinimumAdvance(auth, params.id, body, meta);
  }
}
