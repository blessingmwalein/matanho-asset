'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import type { StepProps } from './types';

export function pick(source: object, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (source as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * One RHF form per wizard step, validated with the shared zod step schema.
 * The form reports every change up to the wizard (autosave + live readiness) and registers its
 * validator so "Continue" can block on errors.
 */
export function useStepForm<S extends z.ZodType>(schema: S, defaults: Record<string, unknown>, props: Pick<StepProps, 'onValues' | 'registerValidator'>) {
  const form = useForm<z.input<S> & Record<string, unknown>, unknown, z.output<S>>({
    resolver: zodResolver(schema as never) as never,
    defaultValues: defaults as never,
    mode: 'onTouched',
  });

  const onValues = React.useRef(props.onValues);
  onValues.current = props.onValues;

  React.useEffect(() => {
    const sub = form.watch(() => onValues.current(form.getValues() as Record<string, unknown>));
    return () => sub.unsubscribe();
  }, [form]);

  // report defaults injected by the step (e.g. declarations pre-set to "No") so readiness and autosave see them
  React.useEffect(() => {
    const values = form.getValues() as Record<string, unknown>;
    if (Object.keys(values).length) onValues.current(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { registerValidator } = props;
  React.useEffect(() => {
    registerValidator(() => form.trigger(undefined, { shouldFocus: true }));
  }, [form, registerValidator]);

  return form;
}
