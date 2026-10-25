import { Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  csrfResponseSchema,
  loginPasswordChangeSchema,
  loginRequestSchema,
  loginResponseSchema,
  meResponseSchema,
  type CsrfResponse,
  type LoginPasswordChange,
  type LoginRequest,
  type LoginResponse,
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
