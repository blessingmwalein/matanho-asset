'use client';

import { useRouter } from 'next/navigation';
import { PageHeader, Panel } from '@/components/nx/layout';
import { SubmissionsRegister } from '@/components/features/company/company-register';

export default function CompanySubmissionsPage() {
  const router = useRouter();
  return (
    <div>
      <PageHeader eyebrow="Portfolio companies" title="Reporting Submissions" description="Monthly reporting packs from portfolio companies. Open a pack to review the figures and evidence, raise questions, request corrections or accept it." />
      <Panel>
        <SubmissionsRegister onOpen={(s) => router.push(`/internal/companies/submissions/${s.id}`)} />
      </Panel>
    </div>
  );
}
