import type { DocumentCategory, DocumentStatus, InvestorStatus, InvestorType, KycStatus, PortfolioStatus, PortfolioType, RiskRating } from '@nexus/shared';

export interface InvestorRow {
  id: string;
  ref: string;
  legalName: string;
  investorType: InvestorType;
  country: string;
  email: string;
  contactName: string;
  kycStatus: KycStatus;
  riskRating: RiskRating | null;
  status: InvestorStatus;
  baseCurrency: string;
  portfolioCount: number;
  totalPortfolioValue: string;
  relationshipManager: string | null;
  relationshipManagerId: string | null;
  createdAt: string;
}

export interface StaffOption {
  id: string;
  name: string;
  email: string;
  role: string | null;
}

export interface InvestorOption {
  id: string;
  ref: string;
  name: string;
  baseCurrency: string;
}

export interface InvestorDetail {
  id: string;
  ref: string;
  legalName: string;
  investorType: InvestorType;
  registrationNumber: string;
  country: string;
  taxIdentificationNumber: string | null;
  registeredAddress: string;
  investmentObjective: string | null;
  classification: string | null;
  baseCurrency: string;
  status: InvestorStatus;
  createdAt: string;
  relationshipManager: { id: string; name: string; email: string } | null;
  contact: { name: string; email: string; phone: string | null };
  bank: { bankName: string | null; accountHolder: string | null; accountMasked: string | null; currency: string | null; swiftBic: string | null };
  kyc: {
    status: KycStatus;
    riskRating: RiskRating | null;
    reviewedAt: string | null;
    nextReviewAt: string | null;
    riskFlags: string[];
    declaration: {
      pep: 'NO' | 'YES' | 'UNKNOWN';
      sanctions: 'NO' | 'YES' | 'UNKNOWN';
      adverseMedia: 'NO' | 'YES' | 'UNKNOWN';
      highRiskJurisdiction: 'NO' | 'YES' | 'UNKNOWN';
      sourceOfFunds: string;
      sourceOfWealth: string;
      expectedActivity: string;
      transactionFrequency: string | null;
      taxResidency: string;
      fatca: string;
      crs: string;
      usIndicia: boolean;
      consentGiven: boolean;
      consentAt: string;
      signatureName: string;
    } | null;
    application: { id: string; reference: string; submittedAt: string | null; decidedAt: string | null; riskFlags: string[] } | null;
  };
  owners: Array<{ id: string; fullName: string; ownershipPercent: string; nationality: string; idReference: string; email: string | null; isController: boolean }>;
  signatories: Array<{ id: string; fullName: string; role: string; email: string; authority: string | null }>;
  accounts: Array<{ id: string; ref: string; name: string; type: string; baseCurrency: string; status: string; portfolioCount: number; value: string }>;
  portfolios: Array<{
    id: string;
    ref: string;
    name: string;
    type: PortfolioType;
    status: PortfolioStatus;
    baseCurrency: string;
    benchmark: string | null;
    inceptionDate: string;
    manager: string | null;
    account: { id: string; ref: string; name: string } | null;
    currentValue: string;
  }>;
  totalPortfolioValue: string;
  documents: Array<{
    id: string;
    ref: string;
    title: string;
    category: DocumentCategory;
    status: DocumentStatus;
    audience: string;
    currentVersionNo: number;
    createdAt: string;
    portfolio: { id: string; ref: string; name: string } | null;
    file: { fileName: string; mimeType: string; sizeBytes: number } | null;
  }>;
  activity: Array<{ id: string; kind: 'AUDIT' | 'TRANSACTION'; at: string; title: string; actor: string | null; detail: string | null }>;
}
