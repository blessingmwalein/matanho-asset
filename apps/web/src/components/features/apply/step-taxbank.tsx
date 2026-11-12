'use client';

import { FormProvider } from 'react-hook-form';
import { CRS_OPTIONS, CURRENCIES, FATCA_OPTIONS, step3Schema } from '@nexus/shared';
import { CheckboxField, FormSection, FullWidth, SelectField, TextField } from '@/components/form/fields';
import { pick, useStepForm } from './use-step-form';
import type { StepProps } from './types';

const KEYS = Object.keys(step3Schema.shape);

/** Step 4: FATCA / CRS classification and the verified funding bank account. */
export function StepTaxBank(props: StepProps) {
  const form = useStepForm(step3Schema, { bankCurrency: 'USD', usIndicia: false, ...pick(props.payload, KEYS) }, props);
  return (
    <FormProvider {...form}>
      <fieldset disabled={props.disabled} className="m-0 min-w-0 border-0 p-0">
        <FormSection title="Tax residence and classification" description="Required for tax classification (FATCA / CRS).">
          <TextField name="taxResidency" label="Primary tax residence" required />
          <SelectField name="fatca" label="FATCA classification" required options={FATCA_OPTIONS} />
          <SelectField name="crs" label="CRS classification" required options={CRS_OPTIONS} />
          <div className="flex items-end pb-1.5">
            <CheckboxField name="usIndicia" label="US indicia present" description="US citizenship, residence, address or tax status (possible)" />
          </div>
        </FormSection>

        <FormSection title="Verified funding account" description="Subscriptions and redemptions should use an account held in the investor's name unless Compliance approves an exception." className="mt-6 border-t border-border-soft pt-5">
          <TextField name="bankName" label="Bank / financial institution" required />
          <TextField name="bankAccountHolder" label="Account holder" required />
          <TextField name="bankAccountNumber" label="Account / IBAN reference" required autoComplete="off" />
          <TextField name="swiftBic" label="SWIFT / BIC" required help="8 or 11 characters, e.g. COBZZWHX" />
          <SelectField name="bankCurrency" label="Account currency" options={CURRENCIES} />
          <FullWidth>
            <p className="rounded-md border border-border-soft bg-surface-2 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
              Bank details are stored with the application and verified by Compliance against the bank evidence you upload in the next step. We show only the last four digits after approval.
            </p>
          </FullWidth>
        </FormSection>
      </fieldset>
    </FormProvider>
  );
}
