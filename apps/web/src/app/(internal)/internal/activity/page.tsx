import { ActivityRegister } from '@/components/features/portfolios/activity-register';

export const metadata = { title: 'Investment Activity' };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <ActivityRegister initialPortfolioId={typeof sp.portfolioId === 'string' ? sp.portfolioId : undefined} />;
}
