'use client';

import {
  createBedSchema,
  createWardSchema,
  nameSchema,
  type Bed,
  type CreateBed,
  type CreateWard,
  type RoomCategory,
  type UpdateWard,
  type Ward,
} from '@devmsr/validation';
import { BedDouble, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { BedStatusBadge } from '@/components/bed-status-badge';
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
import { settingsKeys, useBeds, useRoomCategories, useSave, useWards } from './queries';

const WARDS = ['settings', 'wards'] as const;

/** Keeps the room category select's empty choice as null, which the API reads as "no category". */
const roomCategoryValue = { setValueAs: (value: string | null) => (value === '' ? null : value) };

export function Wards({ canManage }: { canManage: boolean }) {
  const t = useTranslations('settings.wards');
  const tc = useTranslations('common');
  const list = useListParams();
  const wards = useWards(list.params);
  const [editing, setEditing] = useState<Ward | 'new' | null>(null);
  const [bedsOf, setBedsOf] = useState<Ward | null>(null);
  const rows = wards.data?.data ?? [];

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
        id="wards"
        searchLabel={t('search')}
        search={list.search}
        onSearch={list.setSearch}
        includeInactive={list.params.includeInactive}
        onIncludeInactive={list.setIncludeInactive}
      />
      <Table>
        <TableHead>
          <tr>
            <Th className="w-32">{tc('code')}</Th>
            <Th>{tc('name')}</Th>
            <Th>{t('roomCategory')}</Th>
            <Th numeric>{t('beds')}</Th>
            <Th>{tc('status')}</Th>
            <Th className="text-right">{tc('actions')}</Th>
          </tr>
        </TableHead>
        <TableBody>
          <ListStateRow
            colSpan={6}
            isPending={wards.isPending}
            error={wards.error}
            isEmpty={rows.length === 0}
            emptyText={t('empty')}
            onRetry={() => void wards.refetch()}
          />
          {rows.map((ward) => (
            <tr key={ward.id}>
              <Td className="font-mono">{ward.code}</Td>
              <Td className="font-medium">{ward.name}</Td>
              <Td>{ward.roomCategoryName ?? t('noCategory')}</Td>
              <Td numeric>{ward.bedCount}</Td>
              <Td>
                <ActiveBadge active={ward.isActive} />
              </Td>
              <Td className="text-right whitespace-nowrap">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('bedsOf', { name: ward.name })}
                  onClick={() => {
                    setBedsOf(ward);
                  }}
                >
                  <BedDouble aria-hidden />
                  {t('beds')}
                </Button>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={tc('editNamed', { name: ward.name })}
                    onClick={() => {
                      setEditing(ward);
                    }}
                  >
                    <Pencil aria-hidden />
                    {tc('edit')}
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </TableBody>
      </Table>
      {wards.data !== undefined && <Pager page={wards.data.page} pageSize={wards.data.pageSize} total={wards.data.total} onPage={list.setPage} />}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {editing !== null && (
          <WardDialog
            ward={editing === 'new' ? null : editing}
            onDone={() => {
              setEditing(null);
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={bedsOf !== null}
        onOpenChange={(open) => {
          if (!open) setBedsOf(null);
        }}
      >
        {bedsOf !== null && <BedsDialog ward={bedsOf} canManage={canManage} />}
      </Dialog>
    </section>
  );
}

const editWardSchema = z.object({ name: nameSchema, roomCategoryId: z.uuid().nullable(), isActive: z.boolean() });
type EditWardValues = z.infer<typeof editWardSchema>;

/** Loads the room categories first: a select takes its value when it first renders. */
function WardDialog({ ward, onDone }: { ward: Ward | null; onDone: () => void }) {
  const t = useTranslations('settings.wards');
  const tc = useTranslations('common');
  const categories = useRoomCategories(null);
  const title = ward === null ? t('createTitle') : tc('editTitle', { name: ward.name });
  return (
    <DialogContent title={title} closeLabel={tc('close')}>
      {categories.error !== null ? (
        <ErrorAlert error={categories.error} />
      ) : categories.data === undefined ? (
        <p className="text-text-muted">{tc('loading')}</p>
      ) : ward === null ? (
        <CreateWardForm categories={categories.data.data} onDone={onDone} />
      ) : (
        <EditWardForm ward={ward} categories={categories.data.data} onDone={onDone} />
      )}
    </DialogContent>
  );
}

function RoomCategorySelect({
  current,
  options,
  ...props
}: Omit<Parameters<typeof SelectField>[0], 'id' | 'label' | 'children'> & { current?: Ward; options: readonly RoomCategory[] }) {
  const t = useTranslations('settings.wards');
  const currentMissing = current?.roomCategoryId != null && !options.some((category) => category.id === current.roomCategoryId);
  return (
    <SelectField id="ward-category" label={t('roomCategory')} hint={t('roomCategoryHint')} {...props}>
      <option value="">{t('noCategory')}</option>
      {current !== undefined && currentMissing && <option value={current.roomCategoryId ?? ''}>{current.roomCategoryName}</option>}
      {options.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </SelectField>
  );
}

function CreateWardForm({ categories, onDone }: { categories: readonly RoomCategory[]; onDone: () => void }) {
  const t = useTranslations('settings.wards');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateWard>({ resolver: zodResolver(createWardSchema), defaultValues: { code: '', name: '', roomCategoryId: null } });
  const save = useSave(async (body: CreateWard) => unwrap(await api.POST('/api/v1/wards', { params: { header: csrfHeader() }, body })), {
    invalidate: [WARDS],
    onSaved: onDone,
  });

  return (
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
        id="ward-code"
        label={tc('code')}
        hint={t('codeHint')}
        className="font-mono uppercase"
        spellCheck={false}
        error={errors.code && tv('code')}
        {...register('code')}
      />
      <TextField id="ward-name" label={tc('name')} error={errors.name && tv('name')} {...register('name')} />
      <RoomCategorySelect options={categories} {...register('roomCategoryId', roomCategoryValue)} />
      {save.error !== null && <ErrorAlert error={save.error} overrides={{ CONFLICT: tc('codeTaken') }} />}
      <FormActions pending={save.isPending} onCancel={onDone} />
    </form>
  );
}

function EditWardForm({ ward, categories, onDone }: { ward: Ward; categories: readonly RoomCategory[]; onDone: () => void }) {
  const t = useTranslations('settings.wards');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditWardValues>({
    resolver: zodResolver(editWardSchema),
    defaultValues: { name: ward.name, roomCategoryId: ward.roomCategoryId, isActive: ward.isActive },
  });
  const save = useSave(
    async (body: UpdateWard) => unwrap(await api.PATCH('/api/v1/wards/{id}', { params: { header: csrfHeader(), path: { id: ward.id } }, body })),
    { invalidate: [WARDS], onSaved: onDone },
  );

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          const changes = changedFields(ward, values);
          if (changes === null) onDone();
          else save.mutate(changes);
        })(event);
      }}
    >
      <p className="text-sm text-text-muted">
        {tc('code')}: <span className="font-mono">{ward.code}</span>
      </p>
      <TextField id="ward-name" label={tc('name')} error={errors.name && tv('name')} {...register('name')} />
      <RoomCategorySelect current={ward} options={categories} {...register('roomCategoryId', roomCategoryValue)} />
      <CheckboxField id="ward-active" label={tc('activeLabel')} hint={t('activeHint')} {...register('isActive')} />
      {save.error !== null && <ErrorAlert error={save.error} />}
      <FormActions pending={save.isPending} onCancel={onDone} />
    </form>
  );
}

function BedsDialog({ ward, canManage }: { ward: Ward; canManage: boolean }) {
  const t = useTranslations('settings.wards');
  const tc = useTranslations('common');
  const beds = useBeds(ward.id);
  const rows = beds.data?.data ?? [];
  const toggle = useSave(
    async (bed: Bed) =>
      unwrap(
        await api.PATCH('/api/v1/beds/{id}', { params: { header: csrfHeader(), path: { id: bed.id } }, body: { isActive: !bed.isActive } }),
      ),
    { invalidate: [settingsKeys.beds(ward.id)] },
  );

  return (
    <DialogContent title={t('bedsTitle', { name: ward.name })} description={t('bedsDescription')} closeLabel={tc('close')} className="max-w-2xl">
      <div className="space-y-4">
        {canManage && <AddBedForm ward={ward} />}
        {toggle.error !== null && <ErrorAlert error={toggle.error} />}
        <Table>
          <TableHead>
            <tr>
              <Th>{t('bedCode')}</Th>
              <Th>{t('bedStatus')}</Th>
              <Th>{tc('status')}</Th>
              {canManage && <Th className="text-right">{tc('actions')}</Th>}
            </tr>
          </TableHead>
          <TableBody>
            <ListStateRow
              colSpan={canManage ? 4 : 3}
              isPending={beds.isPending}
              error={beds.error}
              isEmpty={rows.length === 0}
              emptyText={t('noBeds')}
              onRetry={() => void beds.refetch()}
            />
            {rows.map((bed) => (
              <tr key={bed.id}>
                <Td className="font-mono">{bed.code}</Td>
                <Td>
                  <BedStatusBadge status={bed.status} />
                </Td>
                <Td>
                  <ActiveBadge active={bed.isActive} />
                </Td>
                {canManage && (
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={toggle.isPending}
                      aria-label={bed.isActive ? t('retireNamed', { code: bed.code }) : t('restoreNamed', { code: bed.code })}
                      onClick={() => {
                        toggle.mutate(bed);
                      }}
                    >
                      {bed.isActive ? t('retire') : t('restore')}
                    </Button>
                  </Td>
                )}
              </tr>
            ))}
          </TableBody>
        </Table>
      </div>
    </DialogContent>
  );
}

function AddBedForm({ ward }: { ward: Ward }) {
  const t = useTranslations('settings.wards');
  const tv = useTranslations('validation');
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<CreateBed>({ resolver: zodResolver(createBedSchema), defaultValues: { code: '' } });
  // Ready for the next bed straight away: beds are usually added in a run. Focus moves once the
  // form has rendered again, because the Add bed button is disabled (and loses focus) while saving.
  const [added, setAdded] = useState(0);
  useEffect(() => {
    if (added > 0) setFocus('code');
  }, [added, setFocus]);
  const save = useSave(
    async (body: CreateBed) => unwrap(await api.POST('/api/v1/wards/{id}/beds', { params: { header: csrfHeader(), path: { id: ward.id } }, body })),
    {
      invalidate: [settingsKeys.beds(ward.id), WARDS],
      onSaved: () => {
        reset();
        setAdded((count) => count + 1);
      },
    },
  );

  return (
    <form
      noValidate
      className="flex flex-wrap items-start gap-2"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          save.mutate(values);
        })(event);
      }}
    >
      <div className="w-48">
        <TextField
          id="bed-code"
          label={t('bedCode')}
          hint={t('bedCodeHint')}
          className="font-mono uppercase"
          spellCheck={false}
          error={errors.code && tv('code')}
          {...register('code')}
        />
      </div>
      <Button type="submit" variant="outline" className="mt-6" disabled={save.isPending}>
        <Plus aria-hidden />
        {t('addBed')}
      </Button>
      {save.error !== null && (
        <div className="w-full">
          <ErrorAlert error={save.error} overrides={{ CONFLICT: t('bedCodeTaken') }} />
        </div>
      )}
    </form>
  );
}
