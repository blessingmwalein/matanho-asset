'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, PanelSkeleton } from '@/components/nx/layout';
import { ReportRunner, type ReportCatalogueItem } from '@/components/features/reports/report-runner';

export default function PortfolioReportsPage() {
  const catalogue = useQuery({ queryKey: ['report-catalogue'], queryFn: () => api<ReportCatalogueItem[]>('/reports') });
  const reports = (catalogue.data ?? []).filter((r) => r.group === 'portfolio');
  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="Portfolio Reports"
        description="Portfolio, holdings, custodian and reporting-status reports generated from live records. Export operational registers to CSV or open a printable view."
      />
      {catalogue.isLoading ? <PanelSkeleton rows={6} /> : <ReportRunner reports={reports} />}
    </>
  );
}
