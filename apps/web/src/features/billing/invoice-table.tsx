'use client';

import type { InvoiceSummary } from '@devmsr/validation';
import { CircleCheck, CircleDollarSign, FilePen } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { formatDateTime, formatPaise } from '@/lib/format';

/** Draft, due or paid: always an icon and a word as well as a colour (section 16). */
export function BillStatus({ invoice }: { invoice: Pick<InvoiceSummary, 'status' | 'duePaise'> }) {
  const t = useTranslations('billing.status');
  if (invoice.status === 'draft') return <StatusBadge tone="neutral" icon={FilePen} label={t('draft')} />;
  return invoice.duePaise > 0 ? (
    <StatusBadge tone="danger" icon={CircleDollarSign} label={t('due')} />
  ) : (
    <StatusBadge tone="success" icon={CircleCheck} label={t('paid')} />
  );
}

/** Bills in a table, each opening its bill page. `showPatient` adds the patient columns on desk lists. */
export function InvoiceTable({
  invoices,
  showPatient,
  emptyText,
  hrefFor = (id) => `/billing/invoices/${id}`,
}: {
  invoices: readonly InvoiceSummary[] | undefined;
  showPatient: boolean;
  emptyText: string;
  hrefFor?: (id: string) => string;
}) {
  const t = useTranslations('billing.table');
  const columns = showPatient ? 7 : 5;
  return (
    <Table>
      <TableHead>
        <tr>
          <Th>{t('number')}</Th>
          {showPatient && <Th>{t('patient')}</Th>}
          {showPatient && <Th>{t('uhid')}</Th>}
          <Th>{t('date')}</Th>
          <Th numeric>{t('total')}</Th>
          <Th numeric>{t('due')}</Th>
          <Th>{t('status')}</Th>
        </tr>
      </TableHead>
      <TableBody>
        {invoices === undefined && <TableMessage colSpan={columns}>{t('loading')}</TableMessage>}
        {invoices?.length === 0 && <TableMessage colSpan={columns}>{emptyText}</TableMessage>}
        {invoices?.map((invoice) => (
          <tr key={invoice.id}>
            <Td>
              <Link href={hrefFor(invoice.id)} className="font-mono font-medium text-primary underline-offset-4 hover:underline">
                {invoice.number ?? t('draft')}
              </Link>
            </Td>
            {showPatient && <Td>{invoice.patientName}</Td>}
            {showPatient && <Td className="font-mono">{invoice.patientUhid}</Td>}
            <Td className="tabular-nums">{formatDateTime(invoice.issuedAt ?? invoice.createdAt)}</Td>
            <Td numeric>{formatPaise(invoice.totalPaise)}</Td>
            <Td numeric>{invoice.status === 'issued' ? formatPaise(invoice.duePaise) : ''}</Td>
            <Td>
              <BillStatus invoice={invoice} />
            </Td>
          </tr>
        ))}
      </TableBody>
    </Table>
  );
}
