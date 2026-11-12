import { SimpleShell } from '@/components/shell/simple-shell';

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return (
    <SimpleShell subtitle="PORTFOLIO COMPANY PORTAL" chip="Portfolio company · secure reporting" width="max-w-[1120px]">
      {children}
    </SimpleShell>
  );
}
