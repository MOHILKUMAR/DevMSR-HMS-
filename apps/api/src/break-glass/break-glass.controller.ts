import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import {
  breakGlassGrantListSchema,
  breakGlassGrantSchema,
  breakGlassHospitalListSchema,
  listQuerySchema,
  startBreakGlassSchema,
  type BreakGlassGrant,
  type ListQuery,
  type StartBreakGlass,
} from '@devmsr/validation';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../auth/decorators.js';
import { ApiContract, ValidBody, ValidQuery } from '../common/contract/api-contract.js';
import { ReqMeta, type RequestMeta } from '../common/http/app-request.js';
import { BreakGlassService } from './break-glass.service.js';

@Controller('break-glass')
export class BreakGlassController {
  constructor(private readonly breakGlass: BreakGlassService) {}

  @Get('hospitals')
  @RequirePermission('platform.break-glass.use')
  @ApiContract({ summary: 'Active hospitals a super admin can open through break-glass', response: breakGlassHospitalListSchema })
  hospitals(): Promise<{ data: { id: string; code: string; name: string }[] }> {
    return this.breakGlass.hospitals();
  }

  @Post()
  @RequirePermission('platform.break-glass.use')
  @ApiContract({
    summary: "Open one hospital's records read-only for 1 hour in this session, with a written reason; its admins are notified",
    body: startBreakGlassSchema,
    response: breakGlassGrantSchema,
  })
  start(@CurrentAuth() auth: AuthContext, @ValidBody() body: StartBreakGlass, @ReqMeta() meta: RequestMeta): Promise<BreakGlassGrant> {
    return this.breakGlass.start(auth, body, meta);
  }

  @Post('current/end')
  @RequirePermission('platform.break-glass.use')
  @HttpCode(204)
  @ApiContract({ summary: 'End your break-glass access now' })
  end(@CurrentAuth() auth: AuthContext, @ReqMeta() meta: RequestMeta): Promise<void> {
    return this.breakGlass.end(auth, meta);
  }

  @Get()
  @RequirePermission('audit.event.read')
  @ApiContract({ summary: "This hospital's break-glass history with each reason", query: listQuerySchema, response: breakGlassGrantListSchema })
  history(@CurrentAuth() auth: AuthContext, @ValidQuery() query: ListQuery): Promise<Paginated<BreakGlassGrant>> {
    return this.breakGlass.history(auth, query);
  }
}
