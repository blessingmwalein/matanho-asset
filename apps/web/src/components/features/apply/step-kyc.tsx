'use client';

import { FormProvider } from 'react-hook-form';
import { SOURCE_OF_FUNDS_OPTIONS, SOURCE_OF_WEALTH_OPTIONS, TRANSACTION_FREQUENCY_OPTIONS, step2Schema } from '@nexus/shared';
import { FormSection, FullWidth, SelectField, TextareaField } from '@/components/form/fields';
import { pick, useStepForm } from './use-step-form';
import type { StepProps } from './types';

const KEYS = Object.keys(step2Schema.shape);
const ANSWERS = [
  { value: 'NO', label: 'No' },
  { value: 'YES', label: 'Yes / possible' },
  { value: 'UNKNOWN', label: 'Unsure' },
];

const DECLARATIONS: Array<{ name: string; title: string; help: string }> = [
  { name: 'pep', title: 'Politically exposed person (PEP)', help: 'Applicant, owner, controller or close associate.' },
  { name: 'sanctions', title: 'Sanctions exposure', help: 'Known current or historic sanctions designation or restriction.' },
  { name: 'adverseMedia', title: 'Adverse media / legal matters', help: 'Material fraud, corruption, financial-crime or regulatory concerns.' },
  { name: 'highRiskJurisdiction', title: 'Enhanced-risk jurisdictions', help: 'Material business, ownership or funds nexus requiring enhanced due diligence.' },
];

/** Step 3: KYC / AML declarations. Anything other than "No" is flagged for enhanced review by Compliance. */
export function StepKyc(props: StepProps) {
  const form = useStepForm(step2Schema, { pep: 'NO', sanctions: 'NO', adverseMedia: 'NO', highRiskJurisdiction: 'NO', transactionFrequency: 'Monthly or less', ...pick(props.payload, KEYS) }, props);
  return (
    <FormProvider {...form}>
      <fieldset disabled={props.disabled} className="m-0 min-w-0 border-0 p-0">
        <FormSection title="Declarations" description="These support due diligence and decide whether enhanced review is required. A flagged answer is not a rejection." columns={1}>
          <div className="grid gap-2 md:grid-cols-2">
            {DECLARATIONS.map((d) => (
              <div key={d.name} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold">{d.title}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{d.help}</div>
                </div>
                <SelectField name={d.name} options={ANSWERS} className="w-[132px] shrink-0" />
              </div>
            ))}
          </div>
        </FormSection>

        <FormSection title="Source of funds and expected activity" className="mt-6 border-t border-border-soft pt-5">
          <SelectField name="sourceOfFunds" label="Primary source of funds" required options={SOURCE_OF_FUNDS_OPTIONS} />
          <SelectField name="sourceOfWealth" label="Primary source of wealth / capital" required options={SOURCE_OF_WEALTH_OPTIONS} />
          <SelectField name="transactionFrequency" label="Expected transaction frequency" options={TRANSACTION_FREQUENCY_OPTIONS} />
          <FullWidth>
            <TextareaField name="expectedActivity" label="Expected investment activity" required rows={3} help="Describe expected subscriptions, withdrawals, transfers, counterparties and any cross-border activity." />
          </FullWidth>
          <FullWidth>
            <TextareaField name="riskNarrative" label="Additional explanation" optional rows={3} help="Explain any declaration answered Yes or Unsure, and any unusual funding circumstances." />
          </FullWidth>
        </FormSection>
      </fieldset>
    </FormProvider>
  );
}
