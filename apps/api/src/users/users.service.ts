import { Injectable } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import type { CreateStaffUser, Role, SetStaffPassword, StaffUser, StaffUserListQuery, UpdateStaffUser } from '@devmsr/validation';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { hashPassword } from '../auth/password.js';
import { SessionsService } from '../auth/sessions.service.js';
import { TwoFactorRepository } from '../auth/two-factor.repository.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { hospitalOf } from '../common/http/hospital-scope.js';
import { paged } from '../common/http/pagination.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import { Prisma } from '../generated/prisma/client.js';
import { toRole, toStaffUser } from './dto/users.mapper.js';
import { UsersRepository } from './users.repository.js';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsService,
    private readonly twoFactor: TwoFactorRepository,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  async list(auth: AuthContext, query: StaffUserListQuery): Promise<Paginated<StaffUser>> {
    const { rows, total } = await this.users.list(hospitalOf(auth), query, query);
    return paged(
      rows.map((row) => toStaffUser(row)),
      total,
      query,
    );
  }

  async create(auth: AuthContext, input: CreateStaffUser, meta: RequestMeta): Promise<StaffUser> {
    const hospitalId = hospitalOf(auth);
    const roleIds = await this.roleIdsFor(hospitalId, input.roleCodes);
    const passwordHash = await hashPassword(input.password);
    try {
      return await this.transactions.run(async (tx) => {
        const row = await this.users.create({ hospitalId, username: input.username, displayName: input.displayName, passwordHash, roleIds }, tx);
        await this.audit.record(
          {
            action: 'users.user.created',
            hospitalId,
            actorUserId: auth.userId,
            entityType: 'user',
            entityId: row.id,
            meta,
            details: { roles: [...new Set(input.roleCodes)].sort().join(',') },
          },
          tx,
        );
        return toStaffUser(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw Errors.conflict('This username is already taken. Choose another.');
      throw error;
    }
  }

  async update(auth: AuthContext, id: string, input: UpdateStaffUser, meta: RequestMeta): Promise<StaffUser> {
    const hospitalId = hospitalOf(auth);
    // An admin cannot raise their own access or lock themselves out.
    if (id === auth.userId && (input.isActive !== undefined || input.roleCodes !== undefined)) {
      throw Errors.selfChangeNotAllowed();
    }
    if ((await this.users.findById(hospitalId, id)) === null) throw Errors.notFound('staff user');
    const roleIds = input.roleCodes === undefined ? undefined : await this.roleIdsFor(hospitalId, input.roleCodes);
    const now = new Date();

    return this.transactions.run(async (tx) => {
      await this.users.update(
        hospitalId,
        id,
        {
          ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
        tx,
      );
      if (roleIds !== undefined) await this.users.replaceRoles(id, roleIds, tx);
      if (input.isActive === false) await this.sessions.endAllForUser(id, 'user_inactive', now, tx);
      await this.audit.record(
        {
          action: 'users.user.updated',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'user',
          entityId: id,
          meta,
          details: {
            fields: Object.keys(input).sort().join(','),
            ...(input.roleCodes === undefined ? {} : { roles: [...new Set(input.roleCodes)].sort().join(',') }),
            ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          },
        },
        tx,
      );
      const row = await this.users.findById(hospitalId, id, tx);
      if (row === null) throw Errors.notFound('staff user');
      return toStaffUser(row);
    });
  }

  /** Sets a password the user must replace at next sign-in, unlocks the account and signs the user out everywhere. */
  async setPassword(auth: AuthContext, id: string, input: SetStaffPassword, meta: RequestMeta): Promise<void> {
    const hospitalId = hospitalOf(auth);
    if (id === auth.userId) throw Errors.selfChangeNotAllowed();
    if ((await this.users.findById(hospitalId, id)) === null) throw Errors.notFound('staff user');
    const passwordHash = await hashPassword(input.password);
    const now = new Date();
    await this.transactions.run(async (tx) => {
      await this.users.setPassword(hospitalId, id, passwordHash, now, tx);
      await this.sessions.endAllForUser(id, 'credentials_changed', now, tx);
      await this.audit.record(
        { action: 'users.user.password-set', hospitalId, actorUserId: auth.userId, entityType: 'user', entityId: id, meta },
        tx,
      );
    });
  }

  /**
   * For a lost phone: switches the user's two-factor off, revokes their recovery codes and signs them
   * out everywhere. If their role needs two-factor, they set it up again at the next sign-in.
   */
  async resetTwoFactor(auth: AuthContext, id: string, meta: RequestMeta): Promise<void> {
    const hospitalId = hospitalOf(auth);
    if (id === auth.userId) throw Errors.selfChangeNotAllowed();
    if ((await this.users.findById(hospitalId, id)) === null) throw Errors.notFound('staff user');
    const now = new Date();
    const user = { userId: id, hospitalId };
    await this.transactions.run(async (tx) => {
      await this.twoFactor.disable(user, tx);
      await this.twoFactor.revokeRecoveryCodes(user, now, tx);
      await this.sessions.endAllForUser(id, 'credentials_changed', now, tx);
      await this.audit.record(
        { action: 'users.user.two-factor-reset', hospitalId, actorUserId: auth.userId, entityType: 'user', entityId: id, meta },
        tx,
      );
    });
  }

  async listRoles(auth: AuthContext): Promise<Role[]> {
    return (await this.users.roles(hospitalOf(auth))).map(toRole);
  }

  private async roleIdsFor(hospitalId: string, codes: readonly string[]): Promise<string[]> {
    const wanted = [...new Set(codes)];
    const roles = await this.users.rolesByCodes(hospitalId, wanted);
    if (roles.length !== wanted.length) throw Errors.roleNotAssignable();
    return roles.map((role) => role.id);
  }
}
