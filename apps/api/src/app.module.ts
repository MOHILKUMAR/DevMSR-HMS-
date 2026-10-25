import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module.js';
import { authCookieNames } from './auth/auth-cookies.js';
import { AuthModule } from './auth/auth.module.js';
import { CsrfGuard } from './auth/guards/csrf.guard.js';
import { PermissionGuard } from './auth/guards/permission.guard.js';
import { RateLimitGuard, rateLimitOptions } from './auth/guards/rate-limit.js';
import { SessionAuthGuard } from './auth/guards/session-auth.guard.js';
import { ConfigModule } from './common/config/config.module.js';
import type { Env } from './common/config/env.js';
import { InputValidationInterceptor } from './common/contract/input-validation.interceptor.js';
import { ResponseShapeInterceptor } from './common/contract/response-shape.interceptor.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor.js';
import { IdempotencyModule } from './common/idempotency/idempotency.module.js';
import { loggerOptions } from './common/logging/logger-options.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { RouteGuardrailsModule } from './common/routes/route-guardrails.js';
import { ApprovalsModule } from './approvals/approvals.module.js';
import { BedsModule } from './beds/beds.module.js';
import { BillingModule } from './billing/billing.module.js';
import { HealthModule } from './health/health.module.js';
import { PatientsModule } from './patients/patients.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { TariffsModule } from './tariffs/tariffs.module.js';
import { UsersModule } from './users/users.module.js';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot(loggerOptions(env)),
        ThrottlerModule.forRoot(rateLimitOptions(env, authCookieNames(env).session)),
        PrismaModule,
        CryptoModule,
        AuditModule,
        IdempotencyModule,
        RouteGuardrailsModule,
        AuthModule,
        HealthModule,
        UsersModule,
        SettingsModule,
        BedsModule,
        TariffsModule,
        PatientsModule,
        BillingModule,
        PaymentsModule,
        ApprovalsModule,
      ],
      // The request pipeline from CLAUDE.md section 4. Nest runs global guards and interceptors in
      // the order they are registered here, so this order is the pipeline order. Do not reorder.
      providers: [
        { provide: APP_GUARD, useClass: RateLimitGuard }, // 3. rate limiter
        { provide: APP_GUARD, useClass: SessionAuthGuard }, // 4. auth guard
        { provide: APP_GUARD, useClass: CsrfGuard }, // 5. CSRF check
        { provide: APP_GUARD, useClass: PermissionGuard }, // 6. permission guard
        { provide: APP_INTERCEPTOR, useClass: InputValidationInterceptor }, // 7. validation
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }, // 8. idempotency
        { provide: APP_INTERCEPTOR, useClass: ResponseShapeInterceptor }, // response DTO shape
        { provide: APP_FILTER, useClass: AllExceptionsFilter }, // 12. error envelope
      ],
    };
  }
}
