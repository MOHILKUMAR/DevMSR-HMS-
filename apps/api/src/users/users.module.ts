import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RolesController, UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, RolesController],
  providers: [UsersService, UsersRepository],
})
export class UsersModule {}
