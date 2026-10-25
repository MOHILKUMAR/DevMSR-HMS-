'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ErrorAlert } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { AgeSex } from '@/features/patients/age-sex';
import { useOpdQueue } from './queries';
import { VisitStatus } from './visit-status';

/** The doctor's queue for today: paid tokens only, in token order. It refreshes as patients pay. */
export function DoctorQueue() {
  const t = useTranslations('opd.queue');
  const queue = useOpdQueue();
  const data = queue.data;

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-text-muted">
          {data?.doctor === null ? t('notLinked') : t('description', { done: data?.completedToday ?? 0 })}
        </p>
      </div>
      {queue.error !== null && <ErrorAlert error={queue.error} />}
      {data?.doctor !== null && (
        <Table>
          <TableHead>
            <tr>
              <Th numeric>{t('token')}</Th>
              <Th>{t('patient')}</Th>
              <Th>{t('status')}</Th>
              <Th>
                <span className="sr-only">{t('actions')}</span>
              </Th>
            </tr>
          </TableHead>
          <TableBody>
            {data === undefined && <TableMessage colSpan={4}>{t('loading')}</TableMessage>}
            {data?.visits.length === 0 && <TableMessage colSpan={4}>{t('empty')}</TableMessage>}
            {data?.visits.map((visit) => (
              <tr key={visit.id}>
                <Td numeric className="text-lg font-semibold">
                  {visit.tokenNumber}
                </Td>
                <Td>
                  <span className="font-medium">{visit.patient.fullName}</span>
                  <span className="block text-xs text-text-muted">
                    <span className="font-mono">{visit.patient.uhid}</span>, <AgeSex patient={visit.patient} />
                  </span>
                </Td>
                <Td>
                  <VisitStatus status={visit.status} />
                </Td>
                <Td>
                  <div className="flex justify-end">
                    <Button asChild variant={visit.status === 'with_doctor' ? 'primary' : 'outline'}>
                      <Link href={`/opd/visits/${visit.id}`} aria-label={t('openFor', { token: visit.tokenNumber, name: visit.patient.fullName })}>
                        {visit.status === 'with_doctor' ? t('continue') : t('open')}
                      </Link>
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
