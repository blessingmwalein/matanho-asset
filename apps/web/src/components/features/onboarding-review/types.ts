import type { ApplicationPayload, ApplicationStatus, DocumentCategory, DocumentStatus, InvestorType, NoteKind, ReadinessResult } from '@nexus/shared';

export interface ApplicationRow {
  id: string;
  reference: string;
  status: ApplicationStatus;
  legalName: string | null;
  investorType: InvestorType | null;
  country: string | null;
  contactName: string | null;
  contactEmail: string | null;
  riskFlags: string[];
  submittedAt: string | null;
  lastSavedAt: string;
  assignedReviewer: string | null;
  readinessScore: number;
  missingCount: number;
}

export interface ApplicationSummary {
  total: number;
  pending: number;
  byStatus: Record<ApplicationStatus, number>;
}

export interface ApplicationDocVersion {
  versionNo: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  note: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface ApplicationDoc {
  id: string;
  ref: string;
  title: string;
  category: DocumentCategory;
  status: DocumentStatus;
  requirementKey: string | null;
  slotTitle: string | null;
  required: boolean;
  currentVersionNo: number;
  createdAt: string;
  versions: ApplicationDocVersion[];
}

type Answer = 'NO' | 'YES' | 'UNKNOWN';

export interface ApplicationDetail {
  id: string;
  reference: string;
  status: ApplicationStatus;
  step: number;
  version: number;
  submittedAt: string | null;
  lastSavedAt: string;
  createdAt: string;
  consentAt: string | null;
  signatureName: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  assignedReviewer: { id: string; name: string | null } | null;
  investor: { id: string; ref: string; legalName: string } | null;
  payload: Partial<ApplicationPayload>;
  owners: Array<{ id: string; fullName: string; ownershipPercent: string; nationality: string; idReference: string; email: string | null; phone: string | null; isController: boolean }>;
  signatories: Array<{ id: string; fullName: string; role: string; email: string; authority: string | null }>;
  declaration: {
    pep: Answer;
    sanctions: Answer;
    adverseMedia: Answer;
    highRiskJurisdiction: Answer;
    sourceOfFunds: string;
    sourceOfWealth: string;
    expectedActivity: string;
    transactionFrequency: string | null;
    riskNarrative: string | null;
    taxResidency: string;
    fatca: string;
    crs: string;
    usIndicia: boolean;
    bankName: string;
    bankAccountHolder: string;
    bankAccountMasked: string;
    bankCurrency: string;
    swiftBic: string;
    consentGiven: boolean;
    consentAt: string;
    signatureName: string;
  } | null;
  riskFlags: string[];
  documents: ApplicationDoc[];
  notes: Array<{ id: string; kind: NoteKind; body: string; authorName: string | null; createdAt: string }>;
  history: Array<{ id: string; action: string; actor: string | null; at: string; before: unknown; after: unknown; metadata: unknown }>;
  readiness: ReadinessResult;
  actions: { startReview: boolean; note: boolean; requestInfo: boolean; approve: boolean; reject: boolean; reopen: boolean };
}
