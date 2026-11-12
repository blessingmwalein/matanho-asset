'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { GitCompareArrows } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel } from '@/components/nx/layout';
import { SubmissionRegister } from '@/components/features/custodian/submission-register';
import { SubmissionSheet } from '@/components/features/custodian/submission-sheet';
import type { SubmissionRow } from '@/components/features/custodian/types';

function Register() {
  const params = useSearchParams();
  const [open, setOpen] = React.useState<SubmissionRow | null>(null);
  const q = params.get('q') ?? undefined;
  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Custodian Submissions"
        description="Every execution and day-end package received from custodians, with the values exactly as submitted, version history and reconciliation status."
        actions={
          <Button asChild variant="secondary">
            <Link href="/internal/operations/reconciliation">
              <GitCompareArrows /> Open reconciliation
            </Link>
          </Button>
        }
      />
      <Panel>
        <SubmissionRegister mode="internal" onOpen={setOpen} activeId={open?.id} initialQuery={q} />
      </Panel>
      <SubmissionSheet mode="internal" row={open} onClose={() => setOpen(null)} />
    </div>
  );
}

export default function CustodianSubmissionsPage() {
  return (
    <React.Suspense fallback={null}>
      <Register />
    </React.Suspense>
  );
}
