import { HoldingsRegister } from '@/components/features/portfolios/holdings-register';

export const metadata = { title: 'Holdings' };

export default async function HoldingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <HoldingsRegister initialPortfolioId={typeof sp.portfolioId === 'string' ? sp.portfolioId : undefined} />;
}
