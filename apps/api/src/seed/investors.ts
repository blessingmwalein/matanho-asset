import type { ApplicationPayload } from '@nexus/shared';
import type { SeedContext } from './seed-context';

interface InvestorSeed {
  key: 'horizon' | 'cedar';
  payload: ApplicationPayload;
  rmKey: string;
  kycDaysAgo: number;
  submittedDaysAgo: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
}

const horizon: ApplicationPayload = {
  investorType: 'PENSION_FUND',
  legalName: 'Horizon Pension Fund',
  registrationNumber: 'PF-2048-ZW',
  country: 'Zimbabwe',
  incorporationDate: '2009-03-12',
  regulatoryStatus: 'Pension / retirement arrangement',
  regulator: 'Insurance and Pensions Commission (IPEC)',
  licenceRef: 'IPEC/PF/2048',
  website: 'https://horizon.example',
  taxIdentificationNumber: 'TIN-77120458',
  registeredAddress: '14 Samora Machel Avenue, Harare, Zimbabwe',
  contactName: 'Chipo Sibanda',
  email: 'finance@horizon.example',
  telephone: '+263 242 700 118',
  investmentObjective: 'Pension / liability matching',
  relationshipRequested: 'Discretionary managed account',
  mandate: 'Balanced Growth',
  initialInvestment: 12000000,
  baseCurrency: 'USD',
  investorClassification: 'Institutional / professional investor',
  owners: [
    { fullName: 'Alois Marufu', ownershipPercent: 34, nationality: 'Zimbabwean', idReference: '63-118420 K 42', email: 'a.marufu@horizon.example', phone: '', isController: true },
    { fullName: 'Grace Tagwirei', ownershipPercent: 33, nationality: 'Zimbabwean', idReference: '08-224781 P 29', email: 'g.tagwirei@horizon.example', phone: '', isController: true },
    { fullName: 'Peter Dzvairo', ownershipPercent: 33, nationality: 'Zimbabwean', idReference: '50-330915 D 18', email: 'p.dzvairo@horizon.example', phone: '', isController: true },
  ],
  signatories: [
    { fullName: 'Alois Marufu', role: 'Chair of Trustees', email: 'a.marufu@horizon.example', authority: 'Sole signatory up to US$5m; joint above' },
    { fullName: 'Chipo Sibanda', role: 'Principal Officer', email: 'finance@horizon.example', authority: 'Joint signatory' },
  ],
  ownershipNarrative: 'Registered pension fund governed by a board of trustees; no individual beneficial ownership. Trustees hold voting control.',
  authorityNarrative: 'Board of Trustees resolution BT/2026/014 authorises investment in managed mandates and private-market funds.',
  pep: 'NO',
  sanctions: 'NO',
  adverseMedia: 'NO',
  highRiskJurisdiction: 'NO',
  sourceOfFunds: 'Pension contributions / member assets',
  sourceOfWealth: 'Pension / institutional assets',
  expectedActivity: 'Quarterly contributions and periodic rebalancing across public and private markets.',
  transactionFrequency: '2–5 per month',
  riskNarrative: '',
  taxResidency: 'Zimbabwe',
  fatca: 'Non-US entity / individual',
  crs: 'Financial institution',
  usIndicia: false,
  bankName: 'CBZ Bank Limited',
  bankAccountHolder: 'Horizon Pension Fund',
  bankAccountNumber: '1012340482',
  bankCurrency: 'USD',
  swiftBic: 'COBZZWHX',
  consent: true,
  signatureName: 'Alois Marufu',
};

const cedar: ApplicationPayload = {
  investorType: 'INSTITUTIONAL',
  legalName: 'Cedar Assurance',
  registrationNumber: 'CO-5530-ZW',
  country: 'Zimbabwe',
  incorporationDate: '2001-07-02',
  regulatoryStatus: 'Regulated financial institution',
  regulator: 'Insurance and Pensions Commission (IPEC)',
  licenceRef: 'IPEC/INS/5530',
  website: 'https://cedar.example',
  taxIdentificationNumber: 'TIN-60417735',
  registeredAddress: '9 Fife Avenue, Harare, Zimbabwe',
  contactName: 'Anesu Phiri',
  email: 'treasury@cedar.example',
  telephone: '+263 242 790 441',
  investmentObjective: 'Income / preservation',
  relationshipRequested: 'Segregated mandate',
  mandate: 'Income Mandate',
  initialInvestment: 4000000,
  baseCurrency: 'USD',
  investorClassification: 'Institutional / professional investor',
  owners: [
    { fullName: 'Joseph Mandaza', ownershipPercent: 60, nationality: 'Zimbabwean', idReference: '42-557812 M 07', email: '', phone: '', isController: false },
    { fullName: 'Memory Kavhu', ownershipPercent: 40, nationality: 'Zimbabwean', idReference: '29-104466 K 31', email: '', phone: '', isController: false },
  ],
  signatories: [
    { fullName: 'Anesu Phiri', role: 'Head of Treasury', email: 'treasury@cedar.example', authority: 'Joint signatory' },
    { fullName: 'Joseph Mandaza', role: 'Managing Director', email: 'j.mandaza@cedar.example', authority: 'Joint signatory' },
  ],
  ownershipNarrative: 'Privately held insurer owned by two shareholders.',
  authorityNarrative: 'Board resolution 2026/07 authorises a segregated income mandate with Matanho Asset Management.',
  pep: 'NO',
  sanctions: 'NO',
  adverseMedia: 'NO',
  highRiskJurisdiction: 'NO',
  sourceOfFunds: 'Operating revenue / treasury funds',
  sourceOfWealth: 'Business / operating activity',
  expectedActivity: 'Investment of insurance float into short-duration income instruments.',
  transactionFrequency: 'Monthly or less',
  riskNarrative: '',
  taxResidency: 'Zimbabwe',
  fatca: 'Non-US entity / individual',
  crs: 'Financial institution',
  usIndicia: false,
  bankName: 'Stanbic Bank Zimbabwe',
  bankAccountHolder: 'Cedar Assurance Company Limited',
  bankAccountNumber: '9140021755',
  bankCurrency: 'USD',
  swiftBic: 'SBICZWHX',
  consent: true,
  signatureName: 'Joseph Mandaza',
};

const SEEDS: InvestorSeed[] = [
  { key: 'horizon', payload: horizon, rmKey: 'user.am', kycDaysAgo: 28, submittedDaysAgo: 140, risk: 'LOW' },
  { key: 'cedar', payload: cedar, rmKey: 'user.am', kycDaysAgo: 41, submittedDaysAgo: 95, risk: 'LOW' },
];

/**
 * The two APPROVED investor masters (Horizon Pension Fund and Cedar Assurance), each created
 * from an approved application so the onboarding history is realistic. Pending / draft
 * applications are seeded separately in applications.ts.
 */
export async function seedInvestors(ctx: SeedContext) {
  const { prisma } = ctx;
  for (const s of SEEDS) {
    const p = s.payload;
    const reference = await ctx.refs.application();
    const submittedAt = ctx.daysAgo(s.submittedDaysAgo);
    const decidedAt = new Date(submittedAt.getTime() + 6 * 86400000);

    const application = await prisma.investorApplication.create({
      data: {
        reference,
        status: 'APPROVED',
        step: 5,
        payload: p as object,
        legalName: p.legalName,
        investorType: p.investorType,
        country: p.country,
        contactName: p.contactName,
        contactEmail: p.email,
        riskFlags: [],
        consentAt: submittedAt,
        signatureName: p.signatureName,
        submittedAt,
        decidedAt,
        decidedById: ctx.get('user.compliance'),
        decisionReason: 'Approved after document and declaration review.',
        assignedReviewerId: ctx.get('user.compliance'),
      },
    });
    ctx.set(`application.${s.key}`, application.id);

    const investor = await prisma.investor.create({
      data: {
        ref: await ctx.refs.investor(),
        organisationId: ctx.get(`org.${s.key}`),
        applicationId: application.id,
        legalName: p.legalName,
        investorType: p.investorType,
        registrationNumber: p.registrationNumber,
        country: p.country,
        taxIdentificationNumber: p.taxIdentificationNumber,
        registeredAddress: p.registeredAddress,
        contactName: p.contactName,
        email: p.email,
        phone: p.telephone,
        investmentObjective: p.investmentObjective,
        classification: p.investorClassification,
        baseCurrency: p.baseCurrency,
        kycStatus: 'VERIFIED',
        riskRating: s.risk,
        kycReviewedAt: ctx.daysAgo(s.kycDaysAgo),
        kycNextReviewAt: ctx.daysFromNow(365 - s.kycDaysAgo),
        relationshipManagerId: ctx.get(s.rmKey),
        status: 'ACTIVE',
        bankName: p.bankName,
        bankAccountHolder: p.bankAccountHolder,
        bankAccountMasked: `•••• ${p.bankAccountNumber.slice(-4)}`,
        bankCurrency: p.bankCurrency,
        swiftBic: p.swiftBic,
        createdById: ctx.get('user.compliance'),
      },
    });
    ctx.set(`investor.${s.key}`, investor.id);

    for (const o of p.owners) {
      await prisma.beneficialOwner.create({
        data: { applicationId: application.id, investorId: investor.id, fullName: o.fullName, ownershipPercent: o.ownershipPercent, nationality: o.nationality, idReference: o.idReference, email: o.email || null, phone: o.phone || null, isController: o.isController ?? false },
      });
    }
    for (const sg of p.signatories) {
      await prisma.authorisedSignatory.create({
        data: { applicationId: application.id, investorId: investor.id, fullName: sg.fullName, role: sg.role, email: sg.email, authority: sg.authority ?? null },
      });
    }
    await prisma.investorDeclaration.create({
      data: {
        applicationId: application.id,
        investorId: investor.id,
        pep: p.pep,
        sanctions: p.sanctions,
        adverseMedia: p.adverseMedia,
        highRiskJurisdiction: p.highRiskJurisdiction,
        sourceOfFunds: p.sourceOfFunds,
        sourceOfWealth: p.sourceOfWealth,
        expectedActivity: p.expectedActivity,
        transactionFrequency: p.transactionFrequency,
        riskNarrative: p.riskNarrative || null,
        taxResidency: p.taxResidency,
        fatca: p.fatca,
        crs: p.crs,
        usIndicia: p.usIndicia,
        bankName: p.bankName,
        bankAccountHolder: p.bankAccountHolder,
        bankAccountNumber: p.bankAccountNumber,
        bankCurrency: p.bankCurrency,
        swiftBic: p.swiftBic,
        consentGiven: true,
        consentAt: submittedAt,
        signatureName: p.signatureName ?? '',
        riskFlags: [],
      },
    });
    await prisma.applicationNote.createMany({
      data: [
        { applicationId: application.id, authorId: ctx.get('user.compliance'), authorName: 'Nyasha Dube', kind: 'NOTE', body: 'Identity, ownership and bank evidence reviewed against originals. No adverse declarations.', createdAt: new Date(submittedAt.getTime() + 3 * 86400000) },
        { applicationId: application.id, authorId: ctx.get('user.compliance'), authorName: 'Nyasha Dube', kind: 'DECISION', body: 'Approved. Investor record created.', createdAt: decidedAt },
      ],
    });
  }
  ctx.log('2 approved investors (Horizon Pension Fund, Cedar Assurance) with owners, signatories and declarations');
}
