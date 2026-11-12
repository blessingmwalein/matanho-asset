'use client';

import * as React from 'react';
import { Wordmark } from '@/components/nx/brand';
import { cn } from '@/lib/utils';
import { NotificationsBell, SecureChip, UserMenu } from './shared';

/**
 * Centered shell for the custodian and portfolio-company portals and the public onboarding page.
 * Lighter than the internal workspace: brand, a "secure workspace" chip, and the user menu.
 */
export function SimpleShell({
  subtitle,
  chip,
  width = 'max-w-[1180px]',
  authenticated = true,
  right,
  children,
}: {
  subtitle?: string;
  chip?: string;
  width?: string;
  authenticated?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className={cn('mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:px-6', width)}>
          <Wordmark subtitle={subtitle} />
          <div className="flex items-center gap-2.5">
            {right}
            {chip && <span className="hidden sm:block"><SecureChip>{chip}</SecureChip></span>}
            {authenticated && (
              <>
                <NotificationsBell />
                <UserMenu />
              </>
            )}
          </div>
        </div>
      </header>
      <main className={cn('mx-auto w-full animate-fade-in px-4 pb-16 pt-6 sm:px-6', width)}>{children}</main>
    </div>
  );
}
