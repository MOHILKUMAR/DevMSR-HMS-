'use client';

import {
  createStaffUserSchema,
  setStaffPasswordSchema,
  type CreateStaffUser,
  type Role,
  type SetStaffPassword,
  type StaffUser,
  type UpdateStaffUser,
} from '@devmsr/validation';
import { KeyRound, Lock, Pencil, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { z } from 'zod';
import { CheckboxField, ErrorAlert, FormActions, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableHead, Td, Th } from '@/components/ui/table';
import { api, csrfHeader } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';
import { zodResolver } from '@/lib/forms';
import { ListToolbar, Pager, useListParams } from './list-controls';
import { ActiveBadge, ListStateRow, SectionHeader } from './parts';
import { staffUserChanges, type EditUserValues } from './changes';
import { useRoles, useSave, useStaffUsers } from './queries';

const USERS = ['settings', 'users'] as const;

export function StaffUsers({ currentUserId }: { currentUserId: string }) {
  const t = useTranslations('settings.users');
  const list = useListParams();
  const users = useStaffUsers(list.params);
  const [editing, setEditing] = useState<StaffUser | 'new' | null>(null);
  const [passwordFor, setPasswordFor] = useState<StaffUser | null>(null);
  const rows = users.data?.data ?? [];

  return (
    <section className="space-y-4">
      <SectionHeader
        title={t('title')}
        description={t('description')}
        action={
          <Button
            onClick={() => {
              setEditing('new');
            }}
          >
            <UserPlus aria-hidden />
            {t('add')}
          </Button>
        }
      />
      <ListToolbar
        id="users"
        searchLabel={t('search')}
        search={list.search}
        onSearch={list.setSearch}
        includeInactive={list.params.includeInactive}
        onIncludeInactive={list.setIncludeInactive}
      />
      <Table>
        <TableHead>
          <tr>
            <Th>{t('name')}</Th>
            <Th>{t('username')}</Th>
            <Th>{t('roles')}</Th>
            <Th>{t('status')}</Th>
            <Th>{t('lastLogin')}</Th>
            <Th className="text-right">{t('actions')}</Th>
          </tr>
        </TableHead>
        <TableBody>
          <ListStateRow
            colSpan={6}
            isPending={users.isPending}
            error={users.error}
            isEmpty={rows.length === 0}
            emptyText={t('empty')}
            onRetry={() => void users.refetch()}
          />
          {rows.map((user) => (
            <tr key={user.id}>
              <Td className="font-medium">{user.displayName}</Td>
              <Td className="font-mono">{user.username}</Td>
              <Td>{user.roles.map((role) => role.name).join(', ')}</Td>
              <Td>
                <span className="flex flex-wrap gap-1">
                  <ActiveBadge active={user.isActive} />
                  {user.locked && <StatusBadge tone="warning" icon={Lock} label={t('locked')} />}
                  {user.mustChangePassword && <StatusBadge tone="info" icon={KeyRound} label={t('mustChange')} />}
                </span>
              </Td>
              <Td className="tabular-nums">{user.lastLoginAt === null ? t('never') : formatDateTime(user.lastLoginAt)}</Td>
              <Td className="text-right whitespace-nowrap">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('editNamed', { name: user.displayName })}
                  onClick={() => {
                    setEditing(user);
                  }}
                >
                  <Pencil aria-hidden />
                  {t('edit')}
                </Button>
                {user.id !== currentUserId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('setPasswordNamed', { name: user.displayName })}
                    onClick={() => {
                      setPasswordFor(user);
                    }}
                  >
                    <KeyRound aria-hidden />
                    {t('setPassword')}
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </TableBody>
      </Table>
      {users.data !== undefined && (
        <Pager page={users.data.page} pageSize={users.data.pageSize} total={users.data.total} onPage={list.setPage} />
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {editing === 'new' && (
          <CreateUserDialog
            onDone={() => {
              setEditing(null);
            }}
          />
        )}
        {editing !== null && editing !== 'new' && (
          <EditUserDialog
            user={editing}
            isSelf={editing.id === currentUserId}
            onDone={() => {
              setEditing(null);
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={passwordFor !== null}
        onOpenChange={(open) => {
          if (!open) setPasswordFor(null);
        }}
      >
        {passwordFor !== null && (
          <PasswordDialog
            user={passwordFor}
            onDone={() => {
              setPasswordFor(null);
            }}
          />
        )}
      </Dialog>
    </section>
  );
}

function RoleChoices({
  roles,
  register,
  invalid,
}: {
  roles: readonly Role[] | undefined;
  register: UseFormRegisterReturn<'roleCodes'>;
  invalid: boolean;
}) {
  const t = useTranslations('settings.users');
  const tv = useTranslations('validation');
  return (
    <fieldset className="space-y-2" aria-describedby={invalid ? 'roles-error' : undefined}>
      <legend className="text-sm font-medium">{t('roles')}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(roles ?? []).map((role) => (
          <label key={role.code} className="flex items-center gap-2 text-sm">
            <input type="checkbox" value={role.code} className="size-4 accent-primary" {...register} />
            {role.name}
          </label>
        ))}
      </div>
      {invalid && (
        <p id="roles-error" className="text-sm text-danger">
          {tv('roles')}
        </p>
      )}
    </fieldset>
  );
}

function CreateUserDialog({ onDone }: { onDone: () => void }) {
  const t = useTranslations('settings.users');
  const tv = useTranslations('validation');
  const tc = useTranslations('common');
  const roles = useRoles();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateStaffUser>({
    resolver: zodResolver(createStaffUserSchema),
    defaultValues: { username: '', displayName: '', password: '', roleCodes: [] },
  });
  const save = useSave(
    async (body: CreateStaffUser) => unwrap(await api.POST('/api/v1/users', { params: { header: csrfHeader() }, body })),
    { invalidate: [USERS], onSaved: onDone },
  );

  return (
    <DialogContent title={t('createTitle')} description={t('createDescription')} closeLabel={tc('close')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            save.mutate(values);
          })(event);
        }}
      >
        <TextField id="user-name" label={t('fullName')} error={errors.displayName && tv('name')} {...register('displayName')} />
        <TextField
          id="user-username"
          label={t('username')}
          hint={t('usernameHint')}
          autoCapitalize="none"
          spellCheck={false}
          error={errors.username && tv('username')}
          {...register('username')}
        />
        <TextField
          id="user-password"
          type="password"
          autoComplete="new-password"
          label={t('password')}
          hint={t('passwordHint')}
          error={errors.password && tv('password')}
          {...register('password')}
        />
        <RoleChoices roles={roles.data?.data} register={register('roleCodes')} invalid={errors.roleCodes !== undefined} />
        {save.error !== null && <ErrorAlert error={save.error} overrides={{ CONFLICT: t('usernameTaken') }} />}
        <FormActions pending={save.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

const editUserFormSchema = z.object({
  displayName: createStaffUserSchema.shape.displayName,
  roleCodes: createStaffUserSchema.shape.roleCodes.optional(),
  isActive: z.boolean().optional(),
});

function EditUserDialog({ user, isSelf, onDone }: { user: StaffUser; isSelf: boolean; onDone: () => void }) {
  const t = useTranslations('settings.users');
  const tv = useTranslations('validation');
  const tc = useTranslations('common');
  const roles = useRoles();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditUserValues>({
    resolver: zodResolver(editUserFormSchema),
    // An admin editing themself may only rename: roles and status are shown, not offered.
    defaultValues: isSelf
      ? { displayName: user.displayName }
      : { displayName: user.displayName, roleCodes: user.roles.map((role) => role.code), isActive: user.isActive },
  });
  const save = useSave(
    async (body: UpdateStaffUser) =>
      unwrap(await api.PATCH('/api/v1/users/{id}', { params: { header: csrfHeader(), path: { id: user.id } }, body })),
    { invalidate: [USERS], onSaved: onDone },
  );

  return (
    <DialogContent title={t('editTitle', { name: user.displayName })} closeLabel={tc('close')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            const changes = staffUserChanges(user, values);
            if (changes === null) onDone();
            else save.mutate(changes);
          })(event);
        }}
      >
        <p className="text-sm text-text-muted">
          {t('username')}: <span className="font-mono">{user.username}</span>
        </p>
        <TextField id="user-name" label={t('fullName')} error={errors.displayName && tv('name')} {...register('displayName')} />
        {isSelf ? (
          <div className="space-y-1 rounded-md bg-neutral-soft p-3 text-sm">
            <p>
              {t('roles')}: {user.roles.map((role) => role.name).join(', ')}
            </p>
            <p className="text-text-muted">{t('selfNote')}</p>
          </div>
        ) : (
          <>
            <RoleChoices roles={roles.data?.data} register={register('roleCodes')} invalid={errors.roleCodes !== undefined} />
            <CheckboxField id="user-active" label={t('activeLabel')} hint={t('activeHint')} {...register('isActive')} />
          </>
        )}
        {save.error !== null && <ErrorAlert error={save.error} />}
        <FormActions pending={save.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

function PasswordDialog({ user, onDone }: { user: StaffUser; onDone: () => void }) {
  const t = useTranslations('settings.users');
  const tv = useTranslations('validation');
  const tc = useTranslations('common');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetStaffPassword>({ resolver: zodResolver(setStaffPasswordSchema), defaultValues: { password: '' } });
  const save = useSave(
    // 204: nothing comes back.
    async (body: SetStaffPassword) => {
      unwrap(await api.POST('/api/v1/users/{id}/password', { params: { header: csrfHeader(), path: { id: user.id } }, body }));
    },
    { invalidate: [USERS], onSaved: onDone },
  );

  return (
    <DialogContent title={t('passwordTitle', { name: user.displayName })} description={t('passwordDescription')} closeLabel={tc('close')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            save.mutate(values);
          })(event);
        }}
      >
        <TextField
          id="user-new-password"
          type="password"
          autoComplete="new-password"
          label={t('password')}
          hint={t('passwordHint')}
          error={errors.password && tv('password')}
          {...register('password')}
        />
        {save.error !== null && <ErrorAlert error={save.error} />}
        <FormActions pending={save.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

