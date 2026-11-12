'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Building2, Landmark, LineChart, ShieldCheck, Users } from 'lucide-react';
import { loginSchema, type LoginInput } from '@nexus/shared';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/nx/brand';
import { TextField } from '@/components/form/fields';
import { SESSION_KEY } from '@/lib/session';
import { cn } from '@/lib/utils';

const SHOW_DEMO = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGINS !== 'false';
// `||` (not `??`): hosted builds pass an empty string when the variable is unset
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || 'Matanho#Demo2026';

const DEMO_GROUPS: Array<{ title: string; icon: React.ReactNode; users: Array<{ role: string; name: string; email: string }> }> = [
  {
    title: 'Matanho staff · internal workspace',
    icon: <ShieldCheck className="size-3.5" />,
    users: [
      { role: 'Administrator', name: 'Tendai Moyo', email: 'admin@matanho.example' },
      { role: 'Asset Manager', name: 'Rudo Chirwa', email: 'am@matanho.example' },
      { role: 'Operations Officer', name: 'Farai Ndlovu', email: 'ops@matanho.example' },
      { role: 'Compliance Reviewer', name: 'Nyasha Dube', email: 'compliance@matanho.example' },
      { role: 'Read-only Staff', name: 'Tariro Banda', email: 'readonly@matanho.example' },
    ],
  },
  { title: 'Investor portal', icon: <Users className="size-3.5" />, users: [{ role: 'Horizon Pension Fund', name: 'Chipo Sibanda', email: 'finance@horizon.example' }, { role: 'Cedar Assurance', name: 'Anesu Phiri', email: 'treasury@cedar.example' }] },
  { title: 'Custodian portal', icon: <Landmark className="size-3.5" />, users: [{ role: 'Zambezi Custody Services', name: 'Simba Gumbo', email: 'ops@zambezicustody.example' }, { role: 'Limpopo Trust & Custody', name: 'Lindiwe Ncube', email: 'ops@limpopocustody.example' }] },
  { title: 'Portfolio company portal', icon: <Building2 className="size-3.5" />, users: [{ role: 'Africa Payments Holdings', name: 'Tapiwa Chinembiri', email: 'finance@africapayments.example' }, { role: 'Lakeside Agri Holdings', name: 'Rufaro Mlambo', email: 'finance@lakesideagri.example' }] },
];

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = React.useState<string | null>(params.get('expired') ? 'Your session expired. Please sign in again.' : null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  async function signIn(values: LoginInput, via?: string) {
    setError(null);
    setBusy(via ?? 'form');
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values), credentials: 'same-origin' });
      const data = (await res.json().catch(() => ({}))) as { user?: { homePath: string }; message?: string };
      if (!res.ok || !data.user) throw new Error(data.message ?? 'Sign in failed');
      qc.clear();
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : data.user.homePath);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
      {/* brand / context column */}
      <section className="relative hidden flex-col justify-between bg-nav p-10 text-nav-ink lg:flex">
        <Wordmark inverted subtitle="Nexus" />
        <div className="max-w-[520px]">
          <div className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-nav-muted">
            <LineChart className="size-3.5 text-nav-accent" /> Institutional asset management
          </div>
          <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.035em] text-white">One platform for investors, custody and portfolio reporting.</h1>
          <p className="mt-4 max-w-[460px] text-[13.5px] leading-relaxed text-[#9aa6b8]">
            Onboarding and KYC, managed portfolios, custodian reconciliation, portfolio-company reporting and investor statements, all on a single record.
          </p>
        </div>
        <div className="text-[11px] text-[#5d697a]">Synthetic demonstration data · Not for production use</div>
      </section>

      {/* sign-in column */}
      <section className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-8 lg:hidden"><Wordmark subtitle="Nexus" /></div>
          <h2 className="text-[22px] font-semibold tracking-[-0.025em]">Sign in</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Use your Matanho Nexus credentials. You will land in the workspace for your organisation.</p>

          <FormProvider {...form}>
            <form className="mt-6 grid gap-4" onSubmit={form.handleSubmit((v) => signIn(v))} noValidate>
              <TextField<LoginInput> name="email" label="Email" type="email" autoComplete="username" placeholder="name@organisation.example" />
              <TextField<LoginInput> name="password" label="Password" type="password" autoComplete="current-password" />
              {error && (
                <p role="alert" className="rounded-md border border-[#e6c3c9] bg-danger-soft px-3 py-2 text-[12px] font-medium text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" size="lg" loading={busy === 'form'} className="w-full">
                Sign in <ArrowRight />
              </Button>
            </form>
          </FormProvider>

          <p className="mt-5 text-center text-[12px] text-muted-foreground">
            Applying to invest?{' '}
            <Link href="/apply" className="font-semibold text-primary hover:underline">
              Start an investor application
            </Link>
          </p>

          {SHOW_DEMO && (
            <div className="mt-8 rounded-lg border border-border bg-surface">
              <div className="border-b border-border-soft px-4 py-2.5">
                <div className="eyebrow">Demo accounts</div>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">One click signs in with the shared demo password.</p>
              </div>
              <div className="nx-scroll max-h-[300px] overflow-y-auto">
                {DEMO_GROUPS.map((g) => (
                  <div key={g.title} className="border-b border-border-soft last:border-b-0">
                    <div className="flex items-center gap-1.5 bg-surface-2 px-4 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
                      {g.icon} {g.title}
                    </div>
                    {g.users.map((u) => (
                      <button
                        key={u.email}
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void signIn({ email: u.email, password: DEMO_PASSWORD }, u.email)}
                        className={cn('flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-60', busy === u.email && 'bg-primary-soft')}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px] font-semibold">{u.role}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {u.name} · {u.email}
                          </span>
                        </span>
                        <ArrowRight className="size-3.5 shrink-0 text-ink-3" />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
