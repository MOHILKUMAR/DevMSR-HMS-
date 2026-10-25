import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  changeOwnPasswordSchema,
  endOtherSessionsResponseSchema,
  idParamsSchema,
  ownSessionListSchema,
  recoveryCodesResponseSchema,
  totpCodeBodySchema,
  totpSetupSchema,
  twoFactorStatusSchema,
  type ChangeOwnPassword,
  type EndOtherSessionsResponse,
  type OwnSession,
  type RecoveryCodesResponse,
  type TotpCodeBody,
  type TotpSetupResponse,
  type TwoFactorStatus,
} from '@devmsr/validation';
import { ApiContract, ValidBody, ValidParams } from '../common/contract/api-contract.js';
import { ReqMeta, type RequestMeta } from '../common/http/app-request.js';
import type { AuthContext } from './auth-context.js';
import { AccountService } from './account.service.js';
import { CurrentAuth, LoginRateLimit, PasswordRateLimit, RequirePermission } from './decorators.js';

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

  @Get('two-factor')
  @RequirePermission('auth.session.manage-own')
  @ApiContract({ summary: 'Whether your two-factor sign-in is on or required, and recovery codes left', response: twoFactorStatusSchema })
  twoFactorStatus(@CurrentAuth() auth: AuthContext): Promise<TwoFactorStatus> {
    return this.account.twoFactorStatus(auth);
  }

  @Post('two-factor/setup')
  @RequirePermission('auth.session.manage-own')
  @HttpCode(200)
  @ApiContract({ summary: 'Start setting up two-factor sign-in: a new secret and QR code to scan', response: totpSetupSchema })
  startTwoFactorSetup(@CurrentAuth() auth: AuthContext): Promise<TotpSetupResponse> {
    return this.account.startTwoFactorSetup(auth);
  }

  // The code routes take the login limit (5 a minute, per session here), so codes cannot be guessed.
  @Post('two-factor/enable')
  @RequirePermission('auth.session.manage-own')
  @LoginRateLimit()
  @HttpCode(200)
  @ApiContract({
    summary: 'Switch two-factor sign-in on with a code from the app; returns recovery codes once',
    body: totpCodeBodySchema,
    response: recoveryCodesResponseSchema,
  })
  enableTwoFactor(@CurrentAuth() auth: AuthContext, @ValidBody() body: TotpCodeBody, @ReqMeta() meta: RequestMeta): Promise<RecoveryCodesResponse> {
    return this.account.enableTwoFactor(auth, body, meta);
  }

  @Post('two-factor/recovery-codes')
  @RequirePermission('auth.session.manage-own')
  @LoginRateLimit()
  @HttpCode(200)
  @ApiContract({
    summary: 'Replace your recovery codes, with a current code from the app',
    body: totpCodeBodySchema,
    response: recoveryCodesResponseSchema,
  })
  newRecoveryCodes(@CurrentAuth() auth: AuthContext, @ValidBody() body: TotpCodeBody, @ReqMeta() meta: RequestMeta): Promise<RecoveryCodesResponse> {
    return this.account.newRecoveryCodes(auth, body, meta);
  }

  @Post('two-factor/disable')
  @RequirePermission('auth.session.manage-own')
  @LoginRateLimit()
  @HttpCode(204)
  @ApiContract({ summary: 'Switch two-factor sign-in off, when your role does not need it', body: totpCodeBodySchema })
  disableTwoFactor(@CurrentAuth() auth: AuthContext, @ValidBody() body: TotpCodeBody, @ReqMeta() meta: RequestMeta): Promise<void> {
    return this.account.disableTwoFactor(auth, body, meta);
  }
}
