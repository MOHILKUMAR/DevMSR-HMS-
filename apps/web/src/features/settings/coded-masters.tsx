'use client';

import { createDepartmentSchema, nameSchema, type CreateDepartment, type Department, type UpdateDepartment } from '@devmsr/validation';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Paginated } from '@devmsr/types';
import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CheckboxField, ErrorAlert, FormActions, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Table, TableBody, TableHead, Td, Th } from '@/components/ui/table';
import { api, csrfHeader } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import { zodResolver } from '@/lib/forms';
import { changedFields } from './changes';
import { ListToolbar, Pager, useListParams } from './list-controls';
import { ActiveBadge, ListStateRow, SectionHeader } from './parts';
import { useDepartments, useRoomCategories, useSave } from './queries';

/** Departments and room categories: both are a code, a name and an active flag. */
export type CodedMasterKind = 'departments' | 'roomCategories';

type CodedRecord = Department;

const LIST_KEYS = {
  departments: ['settings', 'departments'],
  roomCategories: ['settings', 'room-categories'],
} as const;

async function createRecord(kind: CodedMasterKind, body: CreateDepartment): Promise<CodedRecord> {
  const params = { header: csrfHeader() };
  return kind === 'departments'
    ? unwrap(await api.POST('/api/v1/departments', { params, body }))
    : unwrap(await api.POST('/api/v1/room-categories', { params, body }));
}

async function updateRecord(kind: CodedMasterKind, id: string, body: UpdateDepartment): Promise<CodedRecord> {
  const params = { header: csrfHeader(), path: { id } };
  return kind === 'departments'
    ? unwrap(await api.PATCH('/api/v1/departments/{id}', { params, body }))
    : unwrap(await api.PATCH('/api/v1/room-categories/{id}', { params, body }));
}

export function CodedMasters({ kind, canManage }: { kind: CodedMasterKind; canManage: boolean }) {
  return kind === 'departments' ? <DepartmentList canManage={canManage} /> : <RoomCategoryList canManage={canManage} />;
}

function DepartmentList({ canManage }: { canManage: boolean }) {
  const list = useListParams();
  return <CodedMasterView kind="departments" canManage={canManage} list={list} query={useDepartments(list.params)} />;
}

function RoomCategoryList({ canManage }: { canManage: boolean }) {
  const list = useListParams();
  return <CodedMasterView kind="roomCategories" canManage={canManage} list={list} query={useRoomCategories(list.params)} />;
}

function CodedMasterView({
  kind,
  canManage,
  list,
  query,
}: {
  kind: CodedMasterKind;
  canManage: boolean;
  list: ReturnType<typeof useListParams>;
  query: UseQueryResult<Paginated<CodedRecord>>;
}) {
  const t = useTranslations(`settings.${kind}`);
  const tc = useTranslations('common');
  const [editing, setEditing] = useState<CodedRecord | 'new' | null>(null);
  const rows = query.data?.data ?? [];
  const columns = canManage ? 4 : 3;

  return (
    <section className="space-y-4">
      <SectionHeader
        title={t('title')}
        description={t('description')}
        action={
          canManage ? (
            <Button
              variant="outline"
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
        id={kind}
        searchLabel={t('search')}
        search={list.search}
        onSearch={list.setSearch}
        includeInactive={list.params.includeInactive}
        onIncludeInactive={list.setIncludeInactive}
      />
      <Table>
        <TableHead>
          <tr>
            <Th className="w-40">{tc('code')}</Th>
            <Th>{tc('name')}</Th>
            <Th className="w-32">{tc('status')}</Th>
            {canManage && <Th className="w-28 text-right">{tc('actions')}</Th>}
          </tr>
        </TableHead>
        <TableBody>
          <ListStateRow
            colSpan={columns}
            isPending={query.isPending}
            error={query.error}
            isEmpty={rows.length === 0}
            emptyText={t('empty')}
            onRetry={() => void query.refetch()}
          />
          {rows.map((record) => (
            <tr key={record.id}>
              <Td className="font-mono">{record.code}</Td>
              <Td className="font-medium">{record.name}</Td>
              <Td>
                <ActiveBadge active={record.isActive} />
              </Td>
              {canManage && (
                <Td className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={tc('editNamed', { name: record.name })}
                    onClick={() => {
                      setEditing(record);
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
      {query.data !== undefined && (
        <Pager page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPage={list.setPage} />
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {editing === 'new' && (
          <CreateCodedDialog
            kind={kind}
            onDone={() => {
              setEditing(null);
            }}
          />
        )}
        {editing !== null && editing !== 'new' && (
          <EditCodedDialog
            kind={kind}
            record={editing}
            onDone={() => {
              setEditing(null);
            }}
          />
        )}
      </Dialog>
    </section>
  );
}

function CreateCodedDialog({ kind, onDone }: { kind: CodedMasterKind; onDone: () => void }) {
  const t = useTranslations(`settings.${kind}`);
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateDepartment>({ resolver: zodResolver(createDepartmentSchema), defaultValues: { code: '', name: '' } });
  const save = useSave((body: CreateDepartment) => createRecord(kind, body), { invalidate: [LIST_KEYS[kind]], onSaved: onDone });

  return (
    <DialogContent title={t('createTitle')} closeLabel={tc('close')}>
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
          id={`${kind}-code`}
          label={tc('code')}
          hint={t('codeHint')}
          autoCapitalize="characters"
          spellCheck={false}
          className="font-mono uppercase"
          error={errors.code && tv('code')}
          {...register('code')}
        />
        <TextField id={`${kind}-name`} label={tc('name')} error={errors.name && tv('name')} {...register('name')} />
        {save.error !== null && <ErrorAlert error={save.error} overrides={{ CONFLICT: tc('codeTaken') }} />}
        <FormActions pending={save.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

const editCodedSchema = z.object({ name: nameSchema, isActive: z.boolean() });
type EditCodedValues = z.infer<typeof editCodedSchema>;

function EditCodedDialog({ kind, record, onDone }: { kind: CodedMasterKind; record: CodedRecord; onDone: () => void }) {
  const t = useTranslations(`settings.${kind}`);
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditCodedValues>({
    resolver: zodResolver(editCodedSchema),
    defaultValues: { name: record.name, isActive: record.isActive },
  });
  const save = useSave((body: UpdateDepartment) => updateRecord(kind, record.id, body), {
    invalidate: [LIST_KEYS[kind]],
    onSaved: onDone,
  });

  return (
    <DialogContent title={tc('editTitle', { name: record.name })} closeLabel={tc('close')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            const changes = changedFields(record, values);
            if (changes === null) onDone();
            else save.mutate(changes);
          })(event);
        }}
      >
        <p className="text-sm text-text-muted">
          {tc('code')}: <span className="font-mono">{record.code}</span>
        </p>
        <TextField id={`${kind}-name`} label={tc('name')} error={errors.name && tv('name')} {...register('name')} />
        <CheckboxField id={`${kind}-active`} label={tc('activeLabel')} hint={t('activeHint')} {...register('isActive')} />
        {save.error !== null && <ErrorAlert error={save.error} />}
        <FormActions pending={save.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}
