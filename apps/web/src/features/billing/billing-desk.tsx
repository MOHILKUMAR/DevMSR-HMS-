'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/form-fields';
import { PatientPicker } from '@/features/patients/patient-picker';
import { Pager } from '@/features/settings/list-controls';
import { InvoiceTable } from './invoice-table';
import { useInvoices } from './queries';

/** The billing desk: find a patient to bill, finish drafts, and see the latest bills. */
export function BillingDesk() {
  const t = useTranslations('billing.desk');
  const drafts = useInvoices('draft');
  const [page, setPage] = useState(1);
  const issued = useInvoices('issued', page);

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-text-muted">{t('description')}</p>
      </div>
      <PatientPicker id="billing-patient" label={t('findPatient')} hrefFor={(id) => `/billing/patients/${id}`} />

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('drafts')}</h2>
        {drafts.error !== null && <ErrorAlert error={drafts.error} />}
        <InvoiceTable invoices={drafts.data?.data} showPatient emptyText={t('noDrafts')} />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('recent')}</h2>
        {issued.error !== null && <ErrorAlert error={issued.error} />}
        <InvoiceTable invoices={issued.data?.data} showPatient emptyText={t('noBills')} />
        {issued.data !== undefined && <Pager page={issued.data.page} pageSize={issued.data.pageSize} total={issued.data.total} onPage={setPage} />}
      </div>
    </section>
  );
}
