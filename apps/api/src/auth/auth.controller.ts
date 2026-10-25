import { Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  csrfResponseSchema,
  loginPasswordChangeSchema,
  loginRequestSchema,
  loginResponseSchema,
  loginTotpSchema,
  totpCodeBodySchema,
  totpSetupSchema,
  meResponseSchema,
  type CsrfResponse,
  type LoginPasswordChange,
  type LoginRequest,
  type LoginResponse,
  type LoginTotp,
  type TotpCodeBody,
  type TotpSetupResponse,
  type MeResponse,
} from '@devmsr/validation';
import type { Response } from 'express';
import { ApiContract, ValidBody } from '../common/contract/api-contract.js';
import { ReqMeta, type AppRequest, type RequestMeta } from '../common/http/app-request.js';
import type { AuthContext } from './auth-context.js';
import { AuthCookies } from './auth-cookies.js';
import { AuthService, type LoginResult } from './auth.service.js';
import { CurrentAuth, LoginRateLimit, PasswordRateLimit, Public, RequirePermission } from './decorators.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookies,
  ) {}

  /** Reviewed public route: the login screen needs a CSRF token before anyone is signed in. */
  @Get('csrf')
  @Public()
  @ApiContract({ summary: 'Get a CSRF token and set the CSRF cookie', response: csrfResponseSchema })
  csrf(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response): CsrfResponse {
    const csrfToken = this.auth.issueCsrfToken(req.auth?.sessionId ?? null);
    this.cookies.setCsrf(res, csrfToken);
    return { csrfToken };
  }

  /**
   * Reviewed public route: signing in. Rate limited per username and IP, CSRF checked, every attempt
   * recorded. Answers with a session, or with a challenge (cookie) when the user owes another step.
   */
  @Post('login')
  @Public()
  @LoginRateLimit()
  @HttpCode(200)
  @ApiContract({ summary: 'Sign in with username and password', body: loginRequestSchema, response: loginResponseSchema })
  async login(
    @ValidBody() body: LoginRequest,
    @ReqMeta() meta: RequestMeta,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.answer(res, await this.auth.login(body, meta, this.cookies.sessionToken(req)));
  }

  /**
   * Reviewed public route: the change_password step of a sign-in. Only reachable with the httpOnly
   * challenge cookie that a correct password set, CSRF checked, rate limited per challenge.
   */
  @Post('login/password')
  @Public()
  @PasswordRateLimit()
  @HttpCode(200)
  @ApiContract({
    summary: 'Choose your own password at sign-in, after an admin set one',
    body: loginPasswordChangeSchema,
    response: loginResponseSchema,
  })
  async loginPasswordChange(
    @ValidBody() body: LoginPasswordChange,
    @ReqMeta() meta: RequestMeta,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.answer(res, await this.auth.completePasswordChange(this.cookies.challengeToken(req), body, meta));
  }

  @Post('logout')
  @RequirePermission('auth.session.manage-own')
  @HttpCode(204)
  @ApiContract({ summary: 'Sign out and end the current session' })
  async logout(@CurrentAuth() auth: AuthContext, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(auth, meta);
    this.cookies.clear(res);
  }

  /** Reviewed public route: the totp_setup step shows the secret to scan. Only with the challenge cookie. */
  @Get('login/totp/setup')
  @Public()
  @ApiContract({ summary: 'The two-factor secret and QR code to set up at sign-in', response: totpSetupSchema })
  totpSetup(@Req() req: AppRequest): Promise<TotpSetupResponse> {
    return this.auth.totpSetupDetails(this.cookies.challengeToken(req));
  }

  /**
   * Reviewed public route: the totp_setup step. A code from the app switches two-factor on; the
   * session response carries the recovery codes once. Challenge cookie, CSRF and the login limit.
   */
  @Post('login/totp/setup')
  @Public()
  @LoginRateLimit()
  @HttpCode(200)
  @ApiContract({ summary: 'Confirm two-factor setup at sign-in with a code from the app', body: totpCodeBodySchema, response: loginResponseSchema })
  async completeTotpSetup(
    @ValidBody() body: TotpCodeBody,
    @ReqMeta() meta: RequestMeta,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.answer(res, await this.auth.completeTotpSetup(this.cookies.challengeToken(req), body, meta));
  }

  /** Reviewed public route: the totp_verify step, with a code from the app or a recovery code. */
  @Post('login/totp')
  @Public()
  @LoginRateLimit()
  @HttpCode(200)
  @ApiContract({ summary: 'Finish sign-in with a two-factor code or a recovery code', body: loginTotpSchema, response: loginResponseSchema })
  async completeTotpVerify(
    @ValidBody() body: LoginTotp,
    @ReqMeta() meta: RequestMeta,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.answer(res, await this.auth.completeTotpVerify(this.cookies.challengeToken(req), body, meta));
  }

  private answer(res: Response, result: LoginResult): LoginResponse {
    if (result.kind === 'challenge') {
      this.cookies.setChallenge(res, result.challengeToken);
    } else {
      this.cookies.clearChallenge(res);
      this.cookies.setSession(res, result.sessionToken);
      this.cookies.setCsrf(res, result.csrfToken);
    }
    return result.response;
  }

  @Get('me')
  @RequirePermission('auth.session.manage-own')
  @ApiContract({ summary: 'The signed-in user, hospital, permissions and session expiry', response: meResponseSchema })
  me(@CurrentAuth() auth: AuthContext): Promise<MeResponse> {
    return this.auth.me(auth);
  }
}
