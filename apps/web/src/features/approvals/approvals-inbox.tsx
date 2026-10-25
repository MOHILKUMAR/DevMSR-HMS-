'use client';

import { APPROVAL_STATUSES, type ApprovalStatus } from '@devmsr/validation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Pager } from '@/features/settings/list-controls';
import { useApprovalRequests } from './queries';
import { RequestTable, type Me } from './request-table';

/** The approvals inbox: requests waiting for a decision first, then decided ones for the record. */
export function ApprovalsInbox({ me }: { me: Me }) {
  const t = useTranslations('approvals.inbox');
  const ts = useTranslations('approvals.status');
  const [status, setStatus] = useState<ApprovalStatus>('pending');
  const [page, setPage] = useState(1);
  const requests = useApprovalRequests({ status }, page);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-text-muted">{t('description')}</p>
      </div>
      <div role="group" aria-label={t('show')} className="flex flex-wrap gap-2">
        {APPROVAL_STATUSES.map((value) => (
          <Button
            key={value}
            variant={value === status ? 'outline' : 'ghost'}
            aria-pressed={value === status}
            className={value === status ? 'bg-primary-soft' : ''}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
          >
            {ts(value)}
          </Button>
        ))}
      </div>
      {requests.error !== null && <ErrorAlert error={requests.error} />}
      <RequestTable requests={requests.data?.data} me={me} showPatient emptyText={t(`empty.${status}`)} />
      {requests.data !== undefined && <Pager page={requests.data.page} pageSize={requests.data.pageSize} total={requests.data.total} onPage={setPage} />}
    </section>
  );
}
