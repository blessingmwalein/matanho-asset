import { SimpleShell } from '@/components/shell/simple-shell';

export default function CustodianLayout({ children }: { children: React.ReactNode }) {
  return (
    <SimpleShell subtitle="CUSTODIAN DATA PORTAL" chip="Controlled counterparty workspace" width="max-w-[1180px]">
      {children}
    </SimpleShell>
  );
}
