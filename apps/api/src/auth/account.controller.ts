import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  changeOwnPasswordSchema,
  endOtherSessionsResponseSchema,
  idParamsSchema,
  ownSessionListSchema,
  type ChangeOwnPassword,
  type EndOtherSessionsResponse,
  type OwnSession,
} from '@devmsr/validation';
import { ApiContract, ValidBody, ValidParams } from '../common/contract/api-contract.js';
import { ReqMeta, type RequestMeta } from '../common/http/app-request.js';
import type { AuthContext } from './auth-context.js';
import { AccountService } from './account.service.js';
import { CurrentAuth, PasswordRateLimit, RequirePermission } from './decorators.js';

/** The signed-in user's own account (My account). Every role holds `auth.session.manage-own`. */
@Controller('auth')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Post('password')
  @RequirePermission('auth.session.manage-own')
  @PasswordRateLimit()
  @HttpCode(204)
  @ApiContract({ summary: 'Change your own password and end your other sessions', body: changeOwnPasswordSchema })
  changePassword(@CurrentAuth() auth: AuthContext, @ValidBody() body: ChangeOwnPassword, @ReqMeta() meta: RequestMeta): Promise<void> {
    return this.account.changePassword(auth, body, meta);
  }

  @Get('sessions')
  @RequirePermission('auth.session.manage-own')
  @ApiContract({ summary: 'Your own open sessions, the current one marked', response: ownSessionListSchema })
  listSessions(@CurrentAuth() auth: AuthContext): Promise<{ data: OwnSession[] }> {
    return this.account.listSessions(auth);
  }

  @Post('sessions/end-others')
  @RequirePermission('auth.session.manage-own')
  @HttpCode(200)
  @ApiContract({ summary: 'End all your sessions except this one', response: endOtherSessionsResponseSchema })
  endOtherSessions(@CurrentAuth() auth: AuthContext, @ReqMeta() meta: RequestMeta): Promise<EndOtherSessionsResponse> {
    return this.account.endOtherSessions(auth, meta);
  }

  @Post('sessions/:id/end')
  @RequirePermission('auth.session.manage-own')
  @HttpCode(204)
  @ApiContract({ summary: 'End one of your other sessions, for example on a computer you left', params: idParamsSchema })
  endSession(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<void> {
    return this.account.endSession(auth, params.id, meta);
  }
}
