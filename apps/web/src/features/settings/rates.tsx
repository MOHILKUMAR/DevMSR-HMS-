'use client';

import {
  createServiceItemSchema,
  nameSchema,
  SERVICE_KINDS,
  type CreateServiceItem,
  type CreateTariffRate,
  type ServiceItem,
  type ServiceKind,
  type UpdateServiceItem,
} from '@devmsr/validation';
import { History, IndianRupee, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { CheckboxField, ErrorAlert, FormActions, SelectField, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableHead, Td, Th } from '@/components/ui/table';
import { api, csrfHeader } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import { formatDate, formatDateTime, formatPaise, todayIst } from '@/lib/format';
import { zodResolver } from '@/lib/forms';
import { formatBp } from '@/lib/money';
import { changedFields } from './changes';
import { ListToolbar, Pager, useListParams } from './list-controls';
import { ActiveBadge, ListStateRow, SectionHeader } from './parts';
import { useDoctors, useRates, useRoomCategories, useSave, useServiceItems } from './queries';
import { rateFormSchema, toRateBody, type RateFormValues } from './rate-form';

const ITEMS = ['settings', 'service-items'] as const;

type Open = { kind: 'new' } | { kind: 'edit' | 'rate' | 'history'; item: ServiceItem } | null;

export function Rates({ canManage }: { canManage: boolean }) {
  const t = useTranslations('settings.rates');
  const tc = useTranslations('common');
  const list = useListParams();
  const [kind, setKind] = useState<ServiceKind | ''>('');
  const items = useServiceItems({ ...list.params, kind });
  const [open, setOpen] = useState<Open>(null);
  const rows = items.data?.data ?? [];
  const close = () => {
    setOpen(null);
  };

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
                setOpen({ kind: 'new' });
              }}
            >
              <Plus aria-hidden />
              {t('add')}
            </Button>
          ) : undefined
        }
      />
      <ListToolbar
        id="rates"
        searchLabel={t('search')}
        search={list.search}
        onSearch={list.setSearch}
        includeInactive={list.params.includeInactive}
        onIncludeInactive={list.setIncludeInactive}
      >
        <div className="flex items-center gap-2">
          <Label htmlFor="rates-kind" className="whitespace-nowrap">
            {t('kind')}
          </Label>
          <Select
            id="rates-kind"
            className="w-44"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as ServiceKind | '');
              list.setPage(1);
            }}
          >
            <option value="">{t('allKinds')}</option>
            {SERVICE_KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`kinds.${value}`)}
              </option>
            ))}
          </Select>
        </div>
      </ListToolbar>
      <Table>
        <TableHead>
          <tr>
            <Th className="w-32">{tc('code')}</Th>
            <Th>{tc('name')}</Th>
            <Th>{t('kind')}</Th>
            <Th numeric>{t('currentRate')}</Th>
            <Th numeric>{t('tax')}</Th>
            <Th>{t('since')}</Th>
            <Th>{tc('status')}</Th>
            <Th className="text-right">{tc('actions')}</Th>
          </tr>
        </TableHead>
        <TableBody>
          <ListStateRow
            colSpan={8}
            isPending={items.isPending}
            error={items.error}
            isEmpty={rows.length === 0}
            emptyText={t('empty')}
            onRetry={() => void items.refetch()}
          />
          {rows.map((item) => (
            <tr key={item.id}>
              <Td className="font-mono">{item.code}</Td>
              <Td>
                <span className="font-medium">{item.name}</span>
                {(item.doctorName ?? item.roomCategoryName) !== null && (
                  <span className="block text-xs text-text-muted">{item.doctorName ?? item.roomCategoryName}</span>
                )}
              </Td>
              <Td>{t(`kinds.${item.kind}`)}</Td>
              <Td numeric>{item.currentRate === null ? t('noRate') : formatPaise(item.currentRate.ratePaise)}</Td>
              <Td numeric>{item.currentRate === null ? '' : formatBp(item.currentRate.taxRateBp)}</Td>
              <Td className="tabular-nums">{item.currentRate === null ? '' : formatDate(item.currentRate.effectiveFrom)}</Td>
              <Td>
                <ActiveBadge active={item.isActive} />
              </Td>
              <Td className="text-right whitespace-nowrap">
                {canManage && item.isActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('changeRateNamed', { name: item.name })}
                    onClick={() => {
                      setOpen({ kind: 'rate', item });
                    }}
                  >
                    <IndianRupee aria-hidden />
                    {t('changeRate')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('historyNamed', { name: item.name })}
                  onClick={() => {
                    setOpen({ kind: 'history', item });
                  }}
                >
                  <History aria-hidden />
                  {t('history')}
                </Button>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={tc('editNamed', { name: item.name })}
                    onClick={() => {
                      setOpen({ kind: 'edit', item });
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
      {items.data !== undefined && <Pager page={items.data.page} pageSize={items.data.pageSize} total={items.data.total} onPage={list.setPage} />}

      <Dialog
        open={open !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) close();
        }}
      >
        {open?.kind === 'new' && <CreateItemDialog onDone={close} />}
        {open?.kind === 'edit' && <EditItemDialog item={open.item} onDone={close} />}
        {open?.kind === 'rate' && <RateDialog item={open.item} onDone={close} />}
        {open?.kind === 'history' && <HistoryDialog item={open.item} />}
      </Dialog>
    </section>
  );
}

/** A select's empty choice is sent as null. */
const nullableId = { setValueAs: (value: string | null) => (value === '' || value === null ? null : value) };

function CreateItemDialog({ onDone }: { onDone: () => void }) {
  const t = useTranslations('settings.rates');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateServiceItem>({
    resolver: zodResolver(createServiceItemSchema),
    defaultValues: { code: '', name: '', kind: 'procedure', doctorId: null, roomCategoryId: null },
  });
  const kind = useWatch({ control, name: 'kind' });
  const forDoctor = kind === 'consultation';
  const forRoom = kind === 'room' || kind === 'nursing';
  const doctors = useDoctors(null);
  const categories = useRoomCategories(null);
  const save = useSave(
    async (body: CreateServiceItem) => unwrap(await api.POST('/api/v1/service-items', { params: { header: csrfHeader() }, body })),
    { invalidate: [ITEMS], onSaved: onDone },
  );

  return (
    <DialogContent title={t('createTitle')} description={t('createDescription')} closeLabel={tc('close')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            // A link left over from another type is dropped rather than refused.
            save.mutate({ ...values, doctorId: forDoctor ? values.doctorId : null, roomCategoryId: forRoom ? values.roomCategoryId : null });
          })(event);
        }}
      >
        <SelectField id="item-kind" label={t('kind')} {...register('kind')}>
          {SERVICE_KINDS.map((value) => (
            <option key={value} value={value}>
              {t(`kinds.${value}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          id="item-code"
          label={tc('code')}
          hint={t('codeHint')}
          className="font-mono uppercase"
          spellCheck={false}
          error={errors.code && tv('code')}
          {...register('code')}
        />
        <TextField id="item-name" label={tc('name')} hint={t('nameHint')} error={errors.name && tv('name')} {...register('name')} />
        {forDoctor && (
          <SelectField id="item-doctor" label={t('doctor')} hint={t('doctorHint')} {...register('doctorId', nullableId)}>
            <option value="">{t('anyDoctor')}</option>
            {(doctors.data?.data ?? []).map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.fullName}, {doctor.departmentName}
              </option>
            ))}
          </SelectField>
        )}
        {forRoom && (
          <SelectField id="item-category" label={t('roomCategory')} hint={t('roomCategoryHint')} {...register('roomCategoryId', nullableId)}>
            <option value="">{t('anyCategory')}</option>
            {(categories.data?.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
        )}
        <p className="text-sm text-text-muted">{t('rateAfterCreate')}</p>
        {save.error !== null && <ErrorAlert error={save.error} overrides={{ CONFLICT: tc('codeTaken') }} />}
        <FormActions pending={save.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

const editItemSchema = z.object({ name: nameSchema, isActive: z.boolean() });
type EditItemValues = z.infer<typeof editItemSchema>;

function EditItemDialog({ item, onDone }: { item: ServiceItem; onDone: () => void }) {
  const t = useTranslations('settings.rates');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditItemValues>({ resolver: zodResolver(editItemSchema), defaultValues: { name: item.name, isActive: item.isActive } });
  const save = useSave(
    async (body: UpdateServiceItem) =>
      unwrap(await api.PATCH('/api/v1/service-items/{id}', { params: { header: csrfHeader(), path: { id: item.id } }, body })),
    { invalidate: [ITEMS], onSaved: onDone },
  );

  return (
    <DialogContent title={tc('editTitle', { name: item.name })} closeLabel={tc('close')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            const changes = changedFields(item, values);
            if (changes === null) onDone();
            else save.mutate(changes);
          })(event);
        }}
      >
        <p className="text-sm text-text-muted">
          {tc('code')}: <span className="font-mono">{item.code}</span>, {t(`kinds.${item.kind}`)}
        </p>
        <TextField id="item-name" label={tc('name')} error={errors.name && tv('name')} {...register('name')} />
        <CheckboxField id="item-active" label={tc('activeLabel')} hint={t('activeHint')} {...register('isActive')} />
        {save.error !== null && <ErrorAlert error={save.error} />}
        <FormActions pending={save.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

function RateDialog({ item, onDone }: { item: ServiceItem; onDone: () => void }) {
  const t = useTranslations('settings.rates');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const today = todayIst();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RateFormValues>({
    resolver: zodResolver(rateFormSchema),
    // Tax is entered fresh each time on purpose: nothing is assumed about how a service is taxed.
    defaultValues: { rupees: '', taxPercent: '', effectiveFrom: today },
  });
  const save = useSave(
    async (body: CreateTariffRate) =>
      unwrap(await api.POST('/api/v1/service-items/{id}/rates', { params: { header: csrfHeader(), path: { id: item.id } }, body })),
    { invalidate: [ITEMS, ['settings', 'rates', item.id]], onSaved: onDone },
  );

  return (
    <DialogContent title={t('rateTitle', { name: item.name })} description={t('rateDescription')} closeLabel={tc('close')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            const body = toRateBody(values);
            if (body !== null) save.mutate(body);
          })(event);
        }}
      >
        <p className="rounded-md bg-neutral-soft p-3 text-sm">
          {item.currentRate === null
            ? t('noCurrentRate')
            : t('currentRateLine', {
                rate: formatPaise(item.currentRate.ratePaise),
                tax: formatBp(item.currentRate.taxRateBp),
                since: formatDate(item.currentRate.effectiveFrom),
              })}
        </p>
        <TextField
          id="rate-amount"
          label={t('amount')}
          hint={t('amountHint')}
          inputMode="decimal"
          autoComplete="off"
          className="tabular-nums"
          error={errors.rupees && tv('amount')}
          {...register('rupees')}
        />
        <TextField
          id="rate-tax"
          label={t('taxPercent')}
          hint={t('taxHint')}
          inputMode="decimal"
          autoComplete="off"
          className="tabular-nums"
          error={errors.taxPercent && tv('percent')}
          {...register('taxPercent')}
        />
        <TextField
          id="rate-from"
          type="date"
          min={today}
          label={t('effectiveFrom')}
          hint={t('effectiveFromHint')}
          error={errors.effectiveFrom && tv('date')}
          {...register('effectiveFrom')}
        />
        {save.error !== null && <ErrorAlert error={save.error} />}
        <FormActions pending={save.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

function HistoryDialog({ item }: { item: ServiceItem }) {
  const t = useTranslations('settings.rates');
  const tc = useTranslations('common');
  const rates = useRates(item.id);
  const rows = rates.data?.data ?? [];

  return (
    <DialogContent title={t('historyTitle', { name: item.name })} description={t('historyDescription')} closeLabel={tc('close')} className="max-w-2xl">
      <Table>
        <TableHead>
          <tr>
            <Th>{t('from')}</Th>
            <Th>{t('to')}</Th>
            <Th numeric>{t('rate')}</Th>
            <Th numeric>{t('tax')}</Th>
            <Th>{t('enteredOn')}</Th>
          </tr>
        </TableHead>
        <TableBody>
          <ListStateRow
            colSpan={5}
            isPending={rates.isPending}
            error={rates.error}
            isEmpty={rows.length === 0}
            emptyText={t('noHistory')}
            onRetry={() => void rates.refetch()}
          />
          {rows.map((rate) => (
            <tr key={rate.id}>
              <Td className="tabular-nums">{formatDate(rate.effectiveFrom)}</Td>
              <Td className="tabular-nums">{rate.effectiveTo === null ? t('untilChanged') : formatDate(rate.effectiveTo)}</Td>
              <Td numeric>{formatPaise(rate.ratePaise)}</Td>
              <Td numeric>{formatBp(rate.taxRateBp)}</Td>
              <Td className="tabular-nums">{formatDateTime(rate.createdAt)}</Td>
            </tr>
          ))}
        </TableBody>
      </Table>
    </DialogContent>
  );
}
