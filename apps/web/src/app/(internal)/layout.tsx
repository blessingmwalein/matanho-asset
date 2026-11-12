import { InternalShell } from '@/components/shell/internal-shell';

export default function InternalLayout({ children }: { children: React.ReactNode }) {
  return <InternalShell>{children}</InternalShell>;
}
