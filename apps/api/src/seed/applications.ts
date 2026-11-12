import { createHash } from 'crypto';
import { DOCUMENT_SLOTS, deriveRiskFlags, type ApplicationPayload, type DocumentSlot } from '@nexus/shared';
import { buildEvidencePdf } from './pdf';
import type { SeedContext } from './seed-context';

/**
 * Pending / information-requested / draft applications (the two APPROVED ones live in investors.ts).
 *   • Kwekwe Municipal Pension Scheme       SUBMITTED              the "pending application" for the onboarding demo
 *   • Zambezi Heritage Family Office        INFORMATION_REQUESTED  with an INFO_REQUEST note (address evidence missing)
 *   • Msasa Provident Fund                  DRAFT                  resumable from the public form
 * Resume tokens are deterministic but only their SHA-256 is stored (like production). The plain demo tokens are
 * logged here and registered as ctx keys `resume.<name>` so DEMO_CREDENTIALS.md can quote them.
 */

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const kwekwe: ApplicationPayload = {
  investorType: 'PENSION_FUND',
  legalName: 'Kwekwe Municipal Pension Scheme',
  registrationNumber: 'PF-3317-ZW',
  country: 'Zimbabwe',
  incorporationDate: '2014-06-20',
  regulatoryStatus: 'Pension / retirement arrangement',
  regulator: 'Insurance and Pensions Commission (IPEC)',
  licenceRef: 'IPEC/PF/3317',
  website: 'https://kwekwepension.example',
  taxIdentificationNumber: 'TIN-81460392',
  registeredAddress: '22 Civic Centre Road, Kwekwe, Zimbabwe',
  contactName: 'Tendai Mutero',
  email: 'trustees@kwekwepension.example',
  telephone: '+263 255 224 310',
  investmentObjective: 'Pension / liability matching',
  relationshipRequested: 'Segregated mandate',
  mandate: 'Income Mandate',
  initialInvestment: 3000000,
  baseCurrency: 'USD',
  investorClassification: 'Institutional / professional investor',
  owners: [
    { fullName: 'Farirai Chikomo', ownershipPercent: 60, nationality: 'Zimbabwean', idReference: '48-229107 R 55', email: 'f.chikomo@kwekwepension.example', phone: '', isController: true },
    { fullName: 'Nokuthula Sithole', ownershipPercent: 40, nationality: 'Zimbabwean', idReference: '63-410582 T 12', email: 'n.sithole@kwekwepension.example', phone: '', isController: true },
  ],
  signatories: [
    { fullName: 'Farirai Chikomo', role: 'Chair of Trustees', email: 'f.chikomo@kwekwepension.example', authority: 'Joint signatory' },
    { fullName: 'Tendai Mutero', role: 'Principal Officer', email: 'trustees@kwekwepension.example', authority: 'Joint signatory' },
  ],
  ownershipNarrative: 'Municipal pension scheme governed by a board of trustees. Two trustees hold voting control; there is no individual beneficial ownership.',
  authorityNarrative: 'Board of Trustees resolution KMPS/2026/009 authorises a segregated income mandate with Matanho Asset Management.',
  pep: 'NO',
  sanctions: 'NO',
  adverseMedia: 'NO',
  highRiskJurisdiction: 'NO',
  sourceOfFunds: 'Pension contributions / member assets',
  sourceOfWealth: 'Pension / institutional assets',
  expectedActivity: 'Monthly member contributions invested into an income mandate; quarterly benefit-payment liquidity withdrawals.',
  transactionFrequency: 'Monthly or less',
  riskNarrative: '',
  taxResidency: 'Zimbabwe',
  fatca: 'Non-US entity / individual',
  crs: 'Financial institution',
  usIndicia: false,
  bankName: 'CBZ Bank Limited',
  bankAccountHolder: 'Kwekwe Municipal Pension Scheme',
  bankAccountNumber: '1012991744',
  bankCurrency: 'USD',
  swiftBic: 'COBZZWHX',
  consent: true,
  signatureName: 'Farirai Chikomo',
};

const zambezi: ApplicationPayload = {
  investorType: 'FAMILY_OFFICE',
  legalName: 'Zambezi Heritage Family Office',
  registrationNumber: 'CO-7712-ZW',
  country: 'Zimbabwe',
  incorporationDate: '2011-09-05',
  regulatoryStatus: 'Not a regulated financial institution',
  regulator: '',
  licenceRef: '',
  website: '',
  taxIdentificationNumber: 'TIN-70933518',
  registeredAddress: '5 Churchill Close, Borrowdale, Harare, Zimbabwe',
  contactName: 'Rumbidzai Gwatidzo',
  email: 'office@zambeziheritage.example',
  telephone: '+263 242 880 215',
  investmentObjective: 'Long-term capital growth',
  relationshipRequested: 'Discretionary managed account',
  mandate: 'Balanced Growth',
  initialInvestment: 1500000,
  baseCurrency: 'USD',
  investorClassification: 'Qualified / sophisticated investor',
  owners: [
    { fullName: 'Rumbidzai Gwatidzo', ownershipPercent: 70, nationality: 'Zimbabwean', idReference: '29-663410 H 07', email: 'office@zambeziheritage.example', phone: '', isController: true },
    { fullName: 'Kudakwashe Gwatidzo', ownershipPercent: 30, nationality: 'Zimbabwean', idReference: '29-663411 K 07', email: '', phone: '', isController: false },
  ],
  signatories: [{ fullName: 'Rumbidzai Gwatidzo', role: 'Director', email: 'office@zambeziheritage.example', authority: 'Sole signatory' }],
  ownershipNarrative: 'Family investment company owned by two siblings.',
  authorityNarrative: 'Directors resolution of 14 September authorises the opening of a discretionary mandate.',
  pep: 'YES',
  sanctions: 'NO',
  adverseMedia: 'NO',
  highRiskJurisdiction: 'NO',
  sourceOfFunds: 'Sale of business / asset',
  sourceOfWealth: 'Business / operating activity',
  expectedActivity: 'Initial lump-sum investment of sale proceeds followed by annual top-ups.',
  transactionFrequency: 'Monthly or less',
  riskNarrative: 'A close relative holds a ministerial appointment (declared).',
  taxResidency: 'Zimbabwe',
  fatca: 'Non-US entity / individual',
  crs: 'Passive non-financial entity',
  usIndicia: false,
  bankName: 'Stanbic Bank Zimbabwe',
  bankAccountHolder: 'Zambezi Heritage Family Office (Pvt) Ltd',
  bankAccountNumber: '9140558302',
  bankCurrency: 'USD',
  swiftBic: 'SBICZWHX',
  consent: true,
  signatureName: 'Rumbidzai Gwatidzo',
};

const msasa: Partial<ApplicationPayload> = {
  investorType: 'PENSION_FUND',
  legalName: 'Msasa Provident Fund',
  registrationNumber: 'PF-4102-ZW',
  country: 'Zimbabwe',
  registeredAddress: '3 Msasa Park Road, Harare, Zimbabwe',
  contactName: 'Lovemore Chuma',
  email: 'secretary@msasaprovident.example',
  telephone: '+263 242 446 900',
  owners: [{ fullName: 'Lovemore Chuma', ownershipPercent: 100, nationality: 'Zimbabwean', idReference: '', email: '', phone: '', isController: true }],
};

/** Create evidence documents (real PDFs) for the given slots. Used here and by documents.ts for the approved investors. */
export async function seedEvidenceDocuments(
  ctx: SeedContext,
  opts: { applicationId: string; investorId?: string | null; holder: string; applicationRef: string; slots: DocumentSlot[]; status: 'UPLOADED' | 'APPROVED'; actorName: string; ownerOrgId?: string | null },
): Promise<number> {
  let n = 0;
  for (const slot of opts.slots) {
    const buffer = await buildEvidencePdf({
      title: slot.title,
      holder: opts.holder,
      reference: `${opts.applicationRef}/${slot.id}`,
      facts: [
        ['Slot', slot.id],
        ['Category', slot.category],
        ['Application', opts.applicationRef],
      ],
      lines: [slot.help],
    });
    await ctx.docs.create(
      { buffer, originalname: `${slot.id}-${slug(opts.holder)}.pdf`, mimetype: 'application/pdf', size: buffer.length },
      {
        title: slot.title,
        category: slot.category,
        status: opts.status,
        audience: 'INTERNAL',
        applicationId: opts.applicationId,
        investorId: opts.investorId ?? null,
        ownerOrgId: opts.ownerOrgId ?? null,
        requirementKey: slot.id,
      },
      { name: opts.actorName },
    );
    n++;
  }
  return n;
}

interface AppSeed {
  name: string;
  status: 'SUBMITTED' | 'INFORMATION_REQUESTED' | 'DRAFT';
  payload: Partial<ApplicationPayload>;
  step: number;
  createdDaysAgo: number;
  submittedDaysAgo?: number;
  slotIds: string[];
  token: string;
  assigned?: boolean;
}

export async function seedApplications(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;
  const required = DOCUMENT_SLOTS.filter((s) => s.required);

  const seeds: AppSeed[] = [
    { name: 'kwekwe', status: 'SUBMITTED', payload: kwekwe, step: 5, createdDaysAgo: 4, submittedDaysAgo: 1, slotIds: required.map((s) => s.id), token: 'demo-resume-kwekwe-pension' },
    { name: 'info', status: 'INFORMATION_REQUESTED', payload: zambezi, step: 4, createdDaysAgo: 12, submittedDaysAgo: 6, slotIds: required.filter((s) => s.id !== 'address').map((s) => s.id), token: 'demo-resume-zambezi-heritage', assigned: true },
    { name: 'draft', status: 'DRAFT', payload: msasa, step: 1, createdDaysAgo: 2, slotIds: ['legal', 'registry'], token: 'demo-resume-msasa-provident' },
  ];

  for (const s of seeds) {
    const p = s.payload;
    const reference = await ctx.refs.application();
    const full = s.status !== 'DRAFT';
    const submittedAt = s.submittedDaysAgo !== undefined ? ctx.daysAgo(s.submittedDaysAgo) : null;
    const flags = full ? deriveRiskFlags(p) : [];

    const app = await prisma.investorApplication.create({
      data: {
        reference,
        status: s.status,
        step: s.step,
        resumeTokenHash: sha256(s.token),
        payload: p as object,
        legalName: p.legalName ?? null,
        investorType: p.investorType ?? null,
        country: p.country ?? null,
        contactName: p.contactName ?? null,
        contactEmail: p.email ?? null,
        riskFlags: flags,
        consentAt: full ? submittedAt : null,
        signatureName: full ? (p.signatureName ?? null) : null,
        submittedAt,
        lastSavedAt: submittedAt ?? ctx.daysAgo(1),
        assignedReviewerId: s.assigned ? ctx.get('user.compliance') : null,
        createdAt: ctx.daysAgo(s.createdDaysAgo),
      },
    });
    ctx.set(`application.${s.name}`, app.id);
    ctx.set(`resume.${s.name}`, `${reference}|${s.token}`);

    if (full) {
      const f = p as ApplicationPayload;
      await prisma.beneficialOwner.createMany({
        data: f.owners.map((o) => ({ applicationId: app.id, fullName: o.fullName, ownershipPercent: o.ownershipPercent, nationality: o.nationality, idReference: o.idReference, email: o.email || null, phone: o.phone || null, isController: o.isController ?? false })),
      });
      await prisma.authorisedSignatory.createMany({
        data: f.signatories.map((g) => ({ applicationId: app.id, fullName: g.fullName, role: g.role, email: g.email, authority: g.authority ?? null })),
      });
      await prisma.investorDeclaration.create({
        data: {
          applicationId: app.id,
          pep: f.pep,
          sanctions: f.sanctions,
          adverseMedia: f.adverseMedia,
          highRiskJurisdiction: f.highRiskJurisdiction,
          sourceOfFunds: f.sourceOfFunds,
          sourceOfWealth: f.sourceOfWealth,
          expectedActivity: f.expectedActivity,
          transactionFrequency: f.transactionFrequency ?? null,
          riskNarrative: f.riskNarrative || null,
          taxResidency: f.taxResidency,
          fatca: f.fatca,
          crs: f.crs,
          usIndicia: f.usIndicia ?? false,
          bankName: f.bankName,
          bankAccountHolder: f.bankAccountHolder,
          bankAccountNumber: f.bankAccountNumber,
          bankCurrency: f.bankCurrency,
          swiftBic: f.swiftBic,
          consentGiven: true,
          consentAt: submittedAt ?? ctx.today,
          signatureName: f.signatureName ?? '',
          riskFlags: flags,
        },
      });
    }

    if (s.status === 'INFORMATION_REQUESTED') {
      await prisma.applicationNote.create({
        data: {
          applicationId: app.id,
          authorId: ctx.get('user.compliance'),
          authorName: 'Nyasha Dube',
          kind: 'INFO_REQUEST',
          body: 'Please upload proof of registered-office address dated within the last three months, and add the name, role and jurisdiction of the politically exposed relative you declared.',
          createdAt: ctx.daysAgo(3),
        },
      });
    }

    const slots = DOCUMENT_SLOTS.filter((d) => s.slotIds.includes(d.id));
    await seedEvidenceDocuments(ctx, {
      applicationId: app.id,
      holder: p.legalName ?? 'Applicant',
      applicationRef: reference,
      slots,
      status: 'UPLOADED',
      actorName: 'Applicant',
    });
  }

  ctx.log('3 applications: Kwekwe Municipal Pension Scheme (SUBMITTED), Zambezi Heritage Family Office (INFORMATION_REQUESTED), Msasa Provident Fund (DRAFT)');
  for (const s of seeds) {
    const [ref, token] = ctx.get(`resume.${s.name}`).split('|');
    ctx.log(`resume link (${s.status}): /apply?ref=${ref}&token=${token}`);
  }
}
