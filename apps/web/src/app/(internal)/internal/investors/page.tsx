import { InvestorsRegister } from '@/components/features/investors/investors-register';

export const metadata = { title: 'Investor Register' };

export default async function InvestorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const kyc = typeof sp.kycStatus === 'string' ? sp.kycStatus : undefined;
  return <InvestorsRegister initialKyc={kyc} />;
}
