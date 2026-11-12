import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Tone → tailwind class fragments used by status indicators and metric deltas. */
export const TONE_TEXT = {
  neutral: 'text-ink-2',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

export const TONE_DOT = {
  neutral: 'bg-ink-3',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const;

export const TONE_SOFT = {
  neutral: 'bg-surface-sunken text-ink-2',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
} as const;
