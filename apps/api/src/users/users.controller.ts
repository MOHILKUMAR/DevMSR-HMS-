import { Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import {
  createStaffUserSchema,
  idParamsSchema,
  roleListSchema,
  setStaffPasswordSchema,
  staffUserListQuerySchema,
  staffUserListSchema,
  staffUserSchema,
  updateStaffUserSchema,
  type CreateStaffUser,
  type Role,
  type SetStaffPassword,
  type StaffUser,
  type StaffUserListQuery,
  type UpdateStaffUser,
} from '@devmsr/validation';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, PasswordRateLimit, RequirePermission } from '../auth/decorators.js';
import { ApiContract, ValidBody, ValidParams, ValidQuery } from '../common/contract/api-contract.js';
import { ReqMeta, type RequestMeta } from '../common/http/app-request.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('users.user.manage')
  @ApiContract({ summary: 'List staff users of the hospital', query: staffUserListQuerySchema, response: staffUserListSchema })
  list(@CurrentAuth() auth: AuthContext, @ValidQuery() query: StaffUserListQuery): Promise<Paginated<StaffUser>> {
    return this.users.list(auth, query);
  }

  @Post()
  @RequirePermission('users.user.manage')
  @ApiContract({ summary: 'Create a staff user with roles and a first password', body: createStaffUserSchema, response: staffUserSchema })
  create(@CurrentAuth() auth: AuthContext, @ValidBody() body: CreateStaffUser, @ReqMeta() meta: RequestMeta): Promise<StaffUser> {
    return this.users.create(auth, body, meta);
  }

  @Patch(':id')
  @RequirePermission('users.user.manage')
  @ApiContract({
    summary: 'Change a staff user: name, roles, active or not',
    params: idParamsSchema,
    body: updateStaffUserSchema,
    response: staffUserSchema,
  })
  update(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: UpdateStaffUser,
    @ReqMeta() meta: RequestMeta,
  ): Promise<StaffUser> {
    return this.users.update(auth, params.id, body, meta);
  }

  @Post(':id/password')
  @RequirePermission('users.user.manage')
  @PasswordRateLimit()
  @HttpCode(204)
  @ApiContract({ summary: 'Set a new password the user must replace at next sign-in, unlock the account and end its sessions', params: idParamsSchema, body: setStaffPasswordSchema })
  setPassword(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: SetStaffPassword,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.users.setPassword(auth, params.id, body, meta);
  }
}

@Controller('roles')
export class RolesController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('users.user.manage')
  @ApiContract({ summary: 'Roles of the hospital with their permission codes', response: roleListSchema })
  async list(@CurrentAuth() auth: AuthContext): Promise<{ data: Role[] }> {
    return { data: await this.users.listRoles(auth) };
  }
}
