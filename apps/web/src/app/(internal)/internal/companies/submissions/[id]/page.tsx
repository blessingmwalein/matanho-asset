'use client';

import { useParams } from 'next/navigation';
import { ReviewWorkspace } from '@/components/features/company/review-workspace';

export default function CompanySubmissionReviewPage() {
  const params = useParams<{ id: string }>();
  return <ReviewWorkspace id={params.id} />;
}
