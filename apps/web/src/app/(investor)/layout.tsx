import { PortalShell } from '@/components/shell/portal-shell';

export default function InvestorLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>;
}
