import { SimpleShell } from '@/components/shell/simple-shell';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <SimpleShell subtitle="INVESTOR APPLICATION" chip="Secure application" width="max-w-[1380px]" authenticated={false}>
      {children}
    </SimpleShell>
  );
}
