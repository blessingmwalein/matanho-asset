'use client';

import { FormProvider } from 'react-hook-form';
import {
  CLASSIFICATION_OPTIONS,
  CURRENCIES,
  INVESTOR_TYPES,
  INVESTOR_TYPE_LABELS,
  OBJECTIVE_OPTIONS,
  REGULATORY_STATUS_OPTIONS,
  RELATIONSHIP_OPTIONS,
  step0Schema,
} from '@nexus/shared';
import { CurrencyField, DateField, FormSection, FullWidth, SelectField, TextField, TextareaField } from '@/components/form/fields';
import { pick, useStepForm } from './use-step-form';
import type { StepProps } from './types';

const KEYS = Object.keys(step0Schema.shape);
const TYPE_OPTIONS = INVESTOR_TYPES.map((v) => ({ value: v, label: INVESTOR_TYPE_LABELS[v] }));

/** Step 1: investor identity, primary contact and the relationship requested. */
export function StepInvestor(props: StepProps) {
  const form = useStepForm(step0Schema, pick(props.payload, KEYS), props);
  return (
    <FormProvider {...form}>
      <fieldset disabled={props.disabled} className="m-0 min-w-0 border-0 p-0">
        <FormSection title="Investor identity" description="Use legal / registry details, not abbreviated trading names.">
          <SelectField name="investorType" label="Investor type" required options={TYPE_OPTIONS} />
          <TextField name="legalName" label="Legal name" required autoComplete="organization" />
          <TextField name="registrationNumber" label="Registration / identity number" required />
          <TextField name="country" label="Jurisdiction of incorporation / residence" required />
          <DateField name="incorporationDate" label="Date incorporated / date of birth" optional fromYear={1920} toYear={new Date().getFullYear()} />
          <SelectField name="regulatoryStatus" label="Regulatory status" optional options={REGULATORY_STATUS_OPTIONS} />
          <TextField name="regulator" label="Regulator / supervisory body" optional help="If applicable" />
          <TextField name="licenceRef" label="Licence / registration reference" optional help="If applicable" />
          <TextField name="website" label="Website" optional placeholder="https://" />
          <TextField name="taxIdentificationNumber" label="Tax identification number" required />
          <FullWidth>
            <TextareaField name="registeredAddress" label="Registered address" required rows={2} />
          </FullWidth>
        </FormSection>

        <FormSection title="Primary contact" description="The person we contact about this application." className="mt-6 border-t border-border-soft pt-5">
          <TextField name="contactName" label="Contact person" required autoComplete="name" />
          <TextField name="email" label="Contact email" type="email" required autoComplete="email" />
          <TextField name="telephone" label="Telephone" required autoComplete="tel" />
        </FormSection>

        <FormSection title="Investment relationship" description="Used for account setup and suitability / mandate routing." className="mt-6 border-t border-border-soft pt-5">
          <SelectField name="relationshipRequested" label="Relationship requested" options={RELATIONSHIP_OPTIONS} />
          <TextField name="mandate" label="Fund / mandate" optional placeholder="e.g. Balanced Growth" />
          <CurrencyField name="initialInvestment" label="Expected commitment / initial investment" optional />
          <SelectField name="baseCurrency" label="Base currency" options={CURRENCIES} />
          <SelectField name="investmentObjective" label="Investment objective" required options={OBJECTIVE_OPTIONS} />
          <SelectField name="investorClassification" label="Investor classification" required options={CLASSIFICATION_OPTIONS} />
        </FormSection>
      </fieldset>
    </FormProvider>
  );
}
