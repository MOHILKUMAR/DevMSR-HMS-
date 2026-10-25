import { Module } from '@nestjs/common';
import { AuthCookies } from './auth-cookies.js';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { CsrfService } from './csrf.service.js';
import { SessionsRepository } from './sessions.repository.js';
import { SessionsService } from './sessions.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, SessionsService, SessionsRepository, CsrfService, AuthCookies],
  // Used by the global guards registered in AppModule.
  exports: [SessionsService, CsrfService, AuthCookies],
})
export class AuthModule {}
