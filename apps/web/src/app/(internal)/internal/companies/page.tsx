'use client';

import * as React from 'react';
import Link from 'next/link';
import { FileCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel } from '@/components/nx/layout';
import { CompanyRegister, CompanySheet } from '@/components/features/company/company-register';
import type { CompanyRow } from '@/components/features/company/internal-types';

export default function CompaniesPage() {
  const [open, setOpen] = React.useState<CompanyRow | null>(null);
  return (
    <div>
      <PageHeader
        eyebrow="Portfolio companies"
        title="Company Register"
        description="Portfolio companies, their current reporting period and how far each monthly pack has progressed."
        actions={
          <Button asChild variant="secondary">
            <Link href="/internal/companies/submissions">
              <FileCheck2 /> Reporting submissions
            </Link>
          </Button>
        }
      />
      <Panel>
        <CompanyRegister onOpen={setOpen} activeId={open?.id} />
      </Panel>
      <CompanySheet company={open} onClose={() => setOpen(null)} />
    </div>
  );
}
