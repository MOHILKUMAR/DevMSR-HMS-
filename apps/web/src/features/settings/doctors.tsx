'use client';

import { createDoctorSchema, type CreateDoctor, type Department, type Doctor, type StaffUser, type UpdateDoctor } from '@devmsr/validation';
import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CheckboxField, ErrorAlert, FormActions, SelectField, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Table, TableBody, TableHead, Td, Th } from '@/components/ui/table';
import { api, csrfHeader } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import { zodResolver } from '@/lib/forms';
import { changedFields } from './changes';
import { ListToolbar, Pager, useListParams } from './list-controls';
import { ActiveBadge, ListStateRow, SectionHeader } from './parts';
import { useDepartments, useDoctorLogins, useDoctors, useSave } from './queries';

const DOCTORS = ['settings', 'doctors'] as const;

/**
 * Doctors who see patients. `canLinkLogins` is whether this user may list staff logins
 * (users.user.manage); without it the login link is shown but not offered.
 */
export function Doctors({ canManage, canLinkLogins }: { canManage: boolean; canLinkLogins: boolean }) {
  const t = useTranslations('settings.doctors');
  const tc = useTranslations('common');
  const list = useListParams();
  const doctors = useDoctors(list.params);
  const [editing, setEditing] = useState<Doctor | 'new' | null>(null);
  const rows = doctors.data?.data ?? [];
  const columns = canManage ? 7 : 6;

  return (
    <section className="space-y-4">
      <SectionHeader
        title={t('title')}
        description={t('description')}
        action={
          canManage ? (
            <Button
              onClick={() => {
                setEditing('new');
              }}
            >
              <Plus aria-hidden />
              {t('add')}
            </Button>
          ) : undefined
        }
      />
      <ListToolbar
        id="doctors"
        searchLabel={t('search')}
        search={list.search}
        onSearch={list.setSearch}
        includeInactive={list.params.includeInactive}
        onIncludeInactive={list.setIncludeInactive}
      />
      <Table>
        <TableHead>
          <tr>
            <Th>{tc('name')}</Th>
            <Th>{t('department')}</Th>
            <Th>{t('registrationNumber')}</Th>
            <Th>{t('login')}</Th>
            <Th>{t('visiting')}</Th>
            <Th>{tc('status')}</Th>
            {canManage && <Th className="text-right">{tc('actions')}</Th>}
          </tr>
        </TableHead>
        <TableBody>
          <ListStateRow
            colSpan={columns}
            isPending={doctors.isPending}
            error={doctors.error}
            isEmpty={rows.length === 0}
            emptyText={t('empty')}
            onRetry={() => void doctors.refetch()}
          />
          {rows.map((doctor) => (
            <tr key={doctor.id}>
              <Td>
                <span className="font-medium">{doctor.fullName}</span>
                {doctor.qualification !== null && <span className="block text-xs text-text-muted">{doctor.qualification}</span>}
              </Td>
              <Td>{doctor.departmentName}</Td>
              <Td className="font-mono">{doctor.registrationNumber ?? tc('none')}</Td>
              <Td className="font-mono">{doctor.username ?? tc('none')}</Td>
              <Td>{doctor.isVisiting ? tc('yes') : tc('no')}</Td>
              <Td>
                <ActiveBadge active={doctor.isActive} />
              </Td>
              {canManage && (
                <Td className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={tc('editNamed', { name: doctor.fullName })}
                    onClick={() => {
                      setEditing(doctor);
                    }}
                  >
                    <Pencil aria-hidden />
                    {tc('edit')}
                  </Button>
                </Td>
              )}
            </tr>
          ))}
        </TableBody>
      </Table>
      {doctors.data !== undefined && (
        <Pager page={doctors.data.page} pageSize={doctors.data.pageSize} total={doctors.data.total} onPage={list.setPage} />
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {editing !== null && (
          <DoctorDialog
            doctor={editing === 'new' ? null : editing}
            canLinkLogins={canLinkLogins}
            onDone={() => {
              setEditing(null);
            }}
          />
        )}
      </Dialog>
    </section>
  );
}

const doctorFormSchema = createDoctorSchema.extend({ isActive: z.boolean() });
type DoctorForm = z.infer<typeof doctorFormSchema>;

/**
 * Loads the department and login choices first: a select takes its value when it first renders,
 * so the form must not render before its options exist.
 */
function DoctorDialog({ doctor, canLinkLogins, onDone }: { doctor: Doctor | null; canLinkLogins: boolean; onDone: () => void }) {
  const t = useTranslations('settings.doctors');
  const tc = useTranslations('common');
  const departments = useDepartments(null);
  const logins = useDoctorLogins(canLinkLogins);
  const error = departments.error ?? logins.error;
  const loginOptions = canLinkLogins ? logins.data?.data : [];

  return (
    <DialogContent title={doctor === null ? t('createTitle') : tc('editTitle', { name: doctor.fullName })} closeLabel={tc('close')}>
      {error !== null ? (
        <ErrorAlert error={error} />
      ) : departments.data === undefined || loginOptions === undefined ? (
        <p className="text-text-muted">{tc('loading')}</p>
      ) : (
        <DoctorForm
          doctor={doctor}
          departments={departments.data.data}
          logins={canLinkLogins ? loginOptions : null}
          onDone={onDone}
        />
      )}
    </DialogContent>
  );
}

/** Adds a doctor when `doctor` is null, otherwise edits it and sends only what changed. `logins` is null when they cannot be listed. */
function DoctorForm({
  doctor,
  departments,
  logins,
  onDone,
}: {
  doctor: Doctor | null;
  departments: readonly Department[];
  logins: readonly StaffUser[] | null;
  onDone: () => void;
}) {
  const t = useTranslations('settings.doctors');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DoctorForm>({
    resolver: zodResolver(doctorFormSchema),
    defaultValues: {
      fullName: doctor?.fullName ?? '',
      departmentId: doctor?.departmentId ?? '',
      qualification: doctor?.qualification ?? '',
      registrationNumber: doctor?.registrationNumber ?? '',
      userId: doctor?.userId ?? null,
      isVisiting: doctor?.isVisiting ?? false,
      isActive: doctor?.isActive ?? true,
    },
  });
  const save = useSave(
    async (body: CreateDoctor | UpdateDoctor) =>
      doctor === null
        ? unwrap(await api.POST('/api/v1/doctors', { params: { header: csrfHeader() }, body: body as CreateDoctor }))
        : unwrap(await api.PATCH('/api/v1/doctors/{id}', { params: { header: csrfHeader(), path: { id: doctor.id } }, body })),
    { invalidate: [DOCTORS], onSaved: onDone },
  );

  // A retired department or a login outside the list still shows as the current choice.
  const currentDepartmentMissing = doctor !== null && !departments.some((d) => d.id === doctor.departmentId);
  const currentLoginMissing = doctor?.userId != null && !(logins ?? []).some((user) => user.id === doctor.userId);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          if (doctor === null) {
            // A new doctor always starts active.
            const { isActive, ...body } = values;
            save.mutate(body);
            return;
          }
          const changes = changedFields(doctor, values);
          if (changes === null) onDone();
          else save.mutate(changes);
        })(event);
      }}
    >
      <TextField id="doctor-name" label={t('fullName')} hint={t('fullNameHint')} error={errors.fullName && tv('name')} {...register('fullName')} />
      <SelectField id="doctor-department" label={t('department')} error={errors.departmentId && tv('department')} {...register('departmentId')}>
        <option value="">{t('chooseDepartment')}</option>
        {doctor !== null && currentDepartmentMissing && <option value={doctor.departmentId}>{doctor.departmentName}</option>}
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </SelectField>
      <TextField id="doctor-qualification" label={t('qualification')} error={errors.qualification && tv('text')} {...register('qualification')} />
      <TextField
        id="doctor-registration"
        label={t('registrationNumber')}
        hint={t('registrationHint')}
        className="font-mono"
        error={errors.registrationNumber && tv('text')}
        {...register('registrationNumber')}
      />
      {logins !== null ? (
        <SelectField
          id="doctor-login"
          label={t('login')}
          hint={t('loginHint')}
          {...register('userId', { setValueAs: (value: string | null) => (value === '' ? null : value) })}
        >
          <option value="">{t('noLogin')}</option>
          {doctor !== null && currentLoginMissing && <option value={doctor.userId ?? ''}>{doctor.username}</option>}
          {logins.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName} ({user.username})
            </option>
          ))}
        </SelectField>
      ) : (
        <p className="text-sm text-text-muted">
          {t('login')}: <span className="font-mono">{doctor?.username ?? tc('none')}</span>
        </p>
      )}
      <CheckboxField id="doctor-visiting" label={t('visitingLabel')} hint={t('visitingHint')} {...register('isVisiting')} />
      {doctor !== null && <CheckboxField id="doctor-active" label={tc('activeLabel')} hint={t('activeHint')} {...register('isActive')} />}
      {save.error !== null && <ErrorAlert error={save.error} />}
      <FormActions pending={save.isPending} onCancel={onDone} />
    </form>
  );
}
