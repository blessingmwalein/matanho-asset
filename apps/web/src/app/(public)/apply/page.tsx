import { Suspense } from 'react';
import { ApplyWizard } from '@/components/features/apply/apply-wizard';

export const metadata = { title: 'Investor application' };

/** Public 6-step investor onboarding (no login). Resume with /apply?ref=…&token=… */
export default function ApplyPage() {
  return (
    <Suspense fallback={null}>
      <ApplyWizard />
    </Suspense>
  );
}
