import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';
import { AuthCookies } from './auth-cookies.js';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { CsrfService } from './csrf.service.js';
import { FailedLoginAlerts } from './failed-login-alerts.js';
import { SecurityAlertsRepository } from './security-alerts.repository.js';
import { SessionsRepository } from './sessions.repository.js';
import { SessionsService } from './sessions.service.js';
import { TwoFactorRepository } from './two-factor.repository.js';
import { TwoFactorService } from './two-factor.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [AuthController, AccountController],
  providers: [
    AuthService,
    AccountService,
    AuthRepository,
    SessionsService,
    SessionsRepository,
    CsrfService,
    AuthCookies,
    TwoFactorService,
    TwoFactorRepository,
    FailedLoginAlerts,
    SecurityAlertsRepository,
  ],
  // Used by the global guards registered in AppModule, and by user management (two-factor reset).
  exports: [SessionsService, CsrfService, AuthCookies, TwoFactorRepository],
})
export class AuthModule {}
