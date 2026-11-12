-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('ASSET_MANAGER', 'INVESTOR', 'CUSTODIAN', 'PORTFOLIO_COMPANY');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'INVITED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_REQUESTED', 'RESUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NoteKind" AS ENUM ('NOTE', 'INFO_REQUEST', 'DECISION', 'APPLICANT_RESPONSE');

-- CreateEnum
CREATE TYPE "InvestorType" AS ENUM ('INSTITUTIONAL', 'PENSION_FUND', 'CORPORATE_TREASURY', 'FAMILY_OFFICE', 'TRUST_FOUNDATION', 'FUND_VEHICLE', 'INDIVIDUAL_HNW');

-- CreateEnum
CREATE TYPE "InvestorStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'VERIFIED', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RiskRating" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "DeclarationAnswer" AS ENUM ('NO', 'YES', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('REGISTRATION', 'IDENTITY', 'PROOF_OF_ADDRESS', 'OWNERSHIP_EVIDENCE', 'BANK_VERIFICATION', 'SOURCE_OF_FUNDS', 'TAX', 'AUTHORITY_TO_INVEST', 'ADDITIONAL', 'STATEMENT', 'INVESTOR_REPORT', 'NOTICE', 'CAPITAL_CALL', 'AUDITED_FINANCIALS', 'DAY_END_FILE', 'MANAGEMENT_ACCOUNTS', 'BOARD_PACK', 'COMPLIANCE_EVIDENCE', 'REPORTING_SUPPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'UPLOADED', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentAudience" AS ENUM ('INTERNAL', 'INVESTOR', 'COMPANY', 'CUSTODIAN');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('EQUITY', 'FIXED_INCOME', 'CASH', 'PRIVATE_EQUITY', 'PRIVATE_CREDIT', 'REAL_ESTATE', 'OTHER');

-- CreateEnum
CREATE TYPE "PortfolioType" AS ENUM ('MANAGED_ACCOUNT', 'SEGREGATED_MANDATE', 'ADVISORY', 'LIQUIDITY');

-- CreateEnum
CREATE TYPE "PortfolioStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('MANDATE', 'FUND_INTEREST');

-- CreateEnum
CREATE TYPE "HoldingStatus" AS ENUM ('DRAFT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "HoldingSource" AS ENUM ('MANUAL', 'TRANSACTION', 'SEED', 'CUSTODIAN');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('TRADE', 'CASH_IN', 'CASH_OUT', 'DIVIDEND', 'FEE');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReconStatus" AS ENUM ('NOT_STARTED', 'MATCHED', 'UNMATCHED', 'DIFFERENCE', 'PENDING_REVIEW', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ReconItemKind" AS ENUM ('EXECUTION', 'DAY_END', 'INTERNAL_ORPHAN');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('NO_INTERNAL_MATCH', 'NO_CUSTODIAN_RECORD', 'PROBABLE_MATCH', 'QUANTITY_DIFFERENCE', 'PRICE_DIFFERENCE', 'CURRENCY_DIFFERENCE', 'SETTLEMENT_DATE_DIFFERENCE', 'CASH_DIFFERENCE', 'HOLDINGS_VALUE_DIFFERENCE', 'TRADE_COUNT_DIFFERENCE');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('OPEN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "RequirementCategory" AS ENUM ('MANAGEMENT_ACCOUNTS', 'OPERATING_KPIS', 'DEBT_CASH', 'BOARD_PACK', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETE');

-- CreateEnum
CREATE TYPE "CompanySubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'QUESTIONS_OPEN', 'CORRECTIONS_REQUESTED', 'RESUBMITTED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FundType" AS ENUM ('PRIVATE_EQUITY', 'PRIVATE_CREDIT');

-- CreateEnum
CREATE TYPE "CapitalEventKind" AS ENUM ('CALL', 'DISTRIBUTION');

-- CreateEnum
CREATE TYPE "CapitalEventStatus" AS ENUM ('ISSUED', 'FUNDED', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "type" "OrgType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT,
    "country" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "orgType" "OrgType" NOT NULL,
    "permissions" TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganisationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investor" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "applicationId" TEXT,
    "legalName" TEXT NOT NULL,
    "investorType" "InvestorType" NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "taxIdentificationNumber" TEXT,
    "registeredAddress" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "investmentObjective" TEXT,
    "classification" TEXT,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "riskRating" "RiskRating",
    "kycReviewedAt" TIMESTAMP(3),
    "kycNextReviewAt" TIMESTAMP(3),
    "relationshipManagerId" TEXT,
    "status" "InvestorStatus" NOT NULL DEFAULT 'ACTIVE',
    "bankName" TEXT,
    "bankAccountHolder" TEXT,
    "bankAccountMasked" TEXT,
    "bankCurrency" TEXT,
    "swiftBic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Investor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestorApplication" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "step" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "resumeTokenHash" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "legalName" TEXT,
    "investorType" "InvestorType",
    "country" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "riskFlags" TEXT[],
    "consentAt" TIMESTAMP(3),
    "signatureName" TEXT,
    "submittedAt" TIMESTAMP(3),
    "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedReviewerId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficialOwner" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT,
    "investorId" TEXT,
    "fullName" TEXT NOT NULL,
    "ownershipPercent" DECIMAL(9,4) NOT NULL,
    "nationality" TEXT NOT NULL,
    "idReference" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "isController" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeneficialOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorisedSignatory" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT,
    "investorId" TEXT,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "authority" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorisedSignatory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestorDeclaration" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "investorId" TEXT,
    "pep" "DeclarationAnswer" NOT NULL,
    "sanctions" "DeclarationAnswer" NOT NULL,
    "adverseMedia" "DeclarationAnswer" NOT NULL,
    "highRiskJurisdiction" "DeclarationAnswer" NOT NULL,
    "sourceOfFunds" TEXT NOT NULL,
    "sourceOfWealth" TEXT NOT NULL,
    "expectedActivity" TEXT NOT NULL,
    "transactionFrequency" TEXT,
    "riskNarrative" TEXT,
    "taxResidency" TEXT NOT NULL,
    "fatca" TEXT NOT NULL,
    "crs" TEXT NOT NULL,
    "usIndicia" BOOLEAN NOT NULL DEFAULT false,
    "bankName" TEXT NOT NULL,
    "bankAccountHolder" TEXT NOT NULL,
    "bankAccountNumber" TEXT NOT NULL,
    "bankCurrency" TEXT NOT NULL,
    "swiftBic" TEXT NOT NULL,
    "consentGiven" BOOLEAN NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "signatureName" TEXT NOT NULL,
    "riskFlags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestorDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationNote" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "kind" "NoteKind" NOT NULL DEFAULT 'NOTE',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "audience" "DocumentAudience" NOT NULL DEFAULT 'INTERNAL',
    "ownerOrgId" TEXT,
    "investorId" TEXT,
    "portfolioId" TEXT,
    "companyId" TEXT,
    "applicationId" TEXT,
    "submissionId" TEXT,
    "fundId" TEXT,
    "capitalCallId" TEXT,
    "requirementKey" TEXT,
    "reportDate" DATE,
    "currentVersionNo" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageDriver" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "note" TEXT,
    "uploadedById" TEXT,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentBlob" (
    "versionId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "DocumentBlob_pkey" PRIMARY KEY ("versionId")
);

-- CreateTable
CREATE TABLE "Security" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isin" TEXT,
    "assetClass" "AssetClass" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchange" TEXT,
    "lastPrice" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "priceDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priceSource" TEXT NOT NULL DEFAULT 'Seed',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Security_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FundType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "vintage" INTEGER,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentAccount" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL DEFAULT 'MANDATE',
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "fundId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "InvestmentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "accountId" TEXT,
    "type" "PortfolioType" NOT NULL DEFAULT 'MANAGED_ACCOUNT',
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "managerId" TEXT,
    "benchmark" TEXT,
    "inceptionDate" DATE NOT NULL,
    "status" "PortfolioStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "averageCost" DECIMAL(20,6) NOT NULL,
    "currentPrice" DECIMAL(20,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "marketValue" DECIMAL(20,2) NOT NULL,
    "valuationDate" DATE NOT NULL,
    "source" "HoldingSource" NOT NULL DEFAULT 'MANUAL',
    "priceSource" TEXT,
    "status" "HoldingStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentTransaction" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "tradeReference" TEXT,
    "portfolioId" TEXT NOT NULL,
    "securityId" TEXT,
    "type" "TransactionType" NOT NULL DEFAULT 'TRADE',
    "side" "Side",
    "quantity" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "price" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "tradeDate" DATE NOT NULL,
    "settlementDate" DATE,
    "broker" TEXT,
    "notes" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioValuation" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "asOf" DATE NOT NULL,
    "nav" DECIMAL(20,2) NOT NULL,
    "benchmarkIndex" DECIMAL(14,4),
    "source" TEXT NOT NULL DEFAULT 'Seed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioValuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "accountId" TEXT,
    "amount" DECIMAL(20,2) NOT NULL,
    "calledAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "distributedAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "nav" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "irr" DECIMAL(9,4),
    "tvpi" DECIMAL(9,4),
    "dpi" DECIMAL(9,4),
    "asOf" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalCall" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "kind" "CapitalEventKind" NOT NULL DEFAULT 'CALL',
    "amount" DECIMAL(20,2) NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE,
    "status" "CapitalEventStatus" NOT NULL DEFAULT 'ISSUED',
    "fundingAccountMasked" TEXT,
    "noticeDocumentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapitalCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalCallAcknowledgement" (
    "id" TEXT NOT NULL,
    "capitalCallId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapitalCallAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodianAccount" (
    "id" TEXT NOT NULL,
    "custodianOrgId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "portfolioId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustodianAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodianExecution" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "custodianAccountId" TEXT NOT NULL,
    "tradeReference" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "supersedesId" TEXT,
    "correctionReason" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "ticker" TEXT NOT NULL,
    "securityId" TEXT,
    "side" "Side" NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "price" DECIMAL(20,6) NOT NULL,
    "currency" TEXT NOT NULL,
    "settlementDate" DATE NOT NULL,
    "broker" TEXT NOT NULL,
    "note" TEXT,
    "reconStatus" "ReconStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "rawPayload" JSONB NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustodianExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodianDayEndSubmission" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "custodianAccountId" TEXT NOT NULL,
    "statementDate" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "closingCash" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "holdingsMarketValue" DECIMAL(20,2) NOT NULL,
    "tradeCount" INTEGER NOT NULL,
    "documentId" TEXT,
    "fileName" TEXT,
    "fileSha256" TEXT,
    "controlNote" TEXT,
    "reconStatus" "ReconStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "rawPayload" JSONB NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustodianDayEndSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationBatch" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'OPEN',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ReconciliationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "kind" "ReconItemKind" NOT NULL,
    "status" "ReconStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "executionId" TEXT,
    "dayEndId" TEXT,
    "transactionId" TEXT,
    "portfolioId" TEXT,
    "tradeReference" TEXT,
    "ticker" TEXT,
    "quantity" DECIMAL(24,6),
    "price" DECIMAL(20,6),
    "currency" TEXT,
    "matchKey" TEXT,
    "sourceSnapshot" JSONB,
    "internalSnapshot" JSONB,
    "differences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationException" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "ExceptionType" NOT NULL,
    "description" TEXT NOT NULL,
    "expected" TEXT,
    "actual" TEXT,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedByName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioCompany" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT,
    "country" TEXT,
    "fundName" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportingPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportingRequirement" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "category" "RequirementCategory" NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "status" "RequirementStatus" NOT NULL DEFAULT 'PENDING',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportingRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyReportingSubmission" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "CompanySubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "completionPct" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "submittedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyReportingSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyReportingValue" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueNumber" DECIMAL(24,6),
    "valueText" TEXT,
    "valueJson" JSONB,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyReportingValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyReportingQuestion" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "requirementKey" TEXT,
    "question" TEXT NOT NULL,
    "raisedById" TEXT,
    "raisedByName" TEXT,
    "answer" TEXT,
    "answeredById" TEXT,
    "answeredByName" TEXT,
    "answeredAt" TIMESTAMP(3),
    "status" "QuestionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyReportingQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organisationId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "orgId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ip" TEXT,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "statusCode" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_slug_key" ON "Organisation"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE INDEX "OrganisationMembership_organisationId_idx" ON "OrganisationMembership"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationMembership_userId_organisationId_key" ON "OrganisationMembership"("userId", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Investor_ref_key" ON "Investor"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Investor_organisationId_key" ON "Investor"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Investor_applicationId_key" ON "Investor"("applicationId");

-- CreateIndex
CREATE INDEX "Investor_status_idx" ON "Investor"("status");

-- CreateIndex
CREATE INDEX "Investor_kycStatus_idx" ON "Investor"("kycStatus");

-- CreateIndex
CREATE UNIQUE INDEX "InvestorApplication_reference_key" ON "InvestorApplication"("reference");

-- CreateIndex
CREATE INDEX "InvestorApplication_status_idx" ON "InvestorApplication"("status");

-- CreateIndex
CREATE INDEX "InvestorApplication_submittedAt_idx" ON "InvestorApplication"("submittedAt");

-- CreateIndex
CREATE INDEX "BeneficialOwner_applicationId_idx" ON "BeneficialOwner"("applicationId");

-- CreateIndex
CREATE INDEX "BeneficialOwner_investorId_idx" ON "BeneficialOwner"("investorId");

-- CreateIndex
CREATE INDEX "AuthorisedSignatory_applicationId_idx" ON "AuthorisedSignatory"("applicationId");

-- CreateIndex
CREATE INDEX "AuthorisedSignatory_investorId_idx" ON "AuthorisedSignatory"("investorId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestorDeclaration_applicationId_key" ON "InvestorDeclaration"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestorDeclaration_investorId_key" ON "InvestorDeclaration"("investorId");

-- CreateIndex
CREATE INDEX "ApplicationNote_applicationId_createdAt_idx" ON "ApplicationNote"("applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_ref_key" ON "Document"("ref");

-- CreateIndex
CREATE INDEX "Document_investorId_status_idx" ON "Document"("investorId", "status");

-- CreateIndex
CREATE INDEX "Document_applicationId_idx" ON "Document"("applicationId");

-- CreateIndex
CREATE INDEX "Document_companyId_idx" ON "Document"("companyId");

-- CreateIndex
CREATE INDEX "Document_submissionId_idx" ON "Document"("submissionId");

-- CreateIndex
CREATE INDEX "Document_ownerOrgId_idx" ON "Document"("ownerOrgId");

-- CreateIndex
CREATE INDEX "Document_category_idx" ON "Document"("category");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNo_key" ON "DocumentVersion"("documentId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "Security_ticker_key" ON "Security"("ticker");

-- CreateIndex
CREATE INDEX "Security_assetClass_idx" ON "Security"("assetClass");

-- CreateIndex
CREATE UNIQUE INDEX "Fund_ref_key" ON "Fund"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentAccount_ref_key" ON "InvestmentAccount"("ref");

-- CreateIndex
CREATE INDEX "InvestmentAccount_investorId_idx" ON "InvestmentAccount"("investorId");

-- CreateIndex
CREATE UNIQUE INDEX "Portfolio_ref_key" ON "Portfolio"("ref");

-- CreateIndex
CREATE INDEX "Portfolio_investorId_idx" ON "Portfolio"("investorId");

-- CreateIndex
CREATE INDEX "Portfolio_status_idx" ON "Portfolio"("status");

-- CreateIndex
CREATE INDEX "Holding_portfolioId_idx" ON "Holding"("portfolioId");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_portfolioId_securityId_key" ON "Holding"("portfolioId", "securityId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentTransaction_ref_key" ON "InvestmentTransaction"("ref");

-- CreateIndex
CREATE INDEX "InvestmentTransaction_portfolioId_tradeDate_idx" ON "InvestmentTransaction"("portfolioId", "tradeDate");

-- CreateIndex
CREATE INDEX "InvestmentTransaction_status_idx" ON "InvestmentTransaction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentTransaction_portfolioId_tradeReference_key" ON "InvestmentTransaction"("portfolioId", "tradeReference");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioValuation_portfolioId_asOf_key" ON "PortfolioValuation"("portfolioId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "Commitment_fundId_investorId_key" ON "Commitment"("fundId", "investorId");

-- CreateIndex
CREATE UNIQUE INDEX "CapitalCall_ref_key" ON "CapitalCall"("ref");

-- CreateIndex
CREATE INDEX "CapitalCall_commitmentId_idx" ON "CapitalCall"("commitmentId");

-- CreateIndex
CREATE INDEX "CapitalCall_status_dueDate_idx" ON "CapitalCall"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CapitalCallAcknowledgement_capitalCallId_userId_key" ON "CapitalCallAcknowledgement"("capitalCallId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CustodianAccount_accountNumber_key" ON "CustodianAccount"("accountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CustodianAccount_portfolioId_key" ON "CustodianAccount"("portfolioId");

-- CreateIndex
CREATE INDEX "CustodianAccount_custodianOrgId_idx" ON "CustodianAccount"("custodianOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "CustodianExecution_ref_key" ON "CustodianExecution"("ref");

-- CreateIndex
CREATE INDEX "CustodianExecution_isCurrent_reconStatus_idx" ON "CustodianExecution"("isCurrent", "reconStatus");

-- CreateIndex
CREATE INDEX "CustodianExecution_createdAt_idx" ON "CustodianExecution"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustodianExecution_custodianAccountId_tradeReference_versio_key" ON "CustodianExecution"("custodianAccountId", "tradeReference", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CustodianDayEndSubmission_ref_key" ON "CustodianDayEndSubmission"("ref");

-- CreateIndex
CREATE INDEX "CustodianDayEndSubmission_isCurrent_reconStatus_idx" ON "CustodianDayEndSubmission"("isCurrent", "reconStatus");

-- CreateIndex
CREATE UNIQUE INDEX "CustodianDayEndSubmission_custodianAccountId_statementDate__key" ON "CustodianDayEndSubmission"("custodianAccountId", "statementDate", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationBatch_ref_key" ON "ReconciliationBatch"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationBatch_businessDate_key" ON "ReconciliationBatch"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationItem_executionId_key" ON "ReconciliationItem"("executionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationItem_dayEndId_key" ON "ReconciliationItem"("dayEndId");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationItem_transactionId_key" ON "ReconciliationItem"("transactionId");

-- CreateIndex
CREATE INDEX "ReconciliationItem_batchId_status_idx" ON "ReconciliationItem"("batchId", "status");

-- CreateIndex
CREATE INDEX "ReconciliationItem_status_idx" ON "ReconciliationItem"("status");

-- CreateIndex
CREATE INDEX "ReconciliationException_status_idx" ON "ReconciliationException"("status");

-- CreateIndex
CREATE INDEX "ReconciliationException_itemId_idx" ON "ReconciliationException"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioCompany_ref_key" ON "PortfolioCompany"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioCompany_organisationId_key" ON "PortfolioCompany"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportingPeriod_companyId_label_key" ON "ReportingPeriod"("companyId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "ReportingRequirement_periodId_key_key" ON "ReportingRequirement"("periodId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyReportingSubmission_ref_key" ON "CompanyReportingSubmission"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyReportingSubmission_periodId_key" ON "CompanyReportingSubmission"("periodId");

-- CreateIndex
CREATE INDEX "CompanyReportingSubmission_status_idx" ON "CompanyReportingSubmission"("status");

-- CreateIndex
CREATE INDEX "CompanyReportingSubmission_companyId_idx" ON "CompanyReportingSubmission"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyReportingValue_submissionId_key_key" ON "CompanyReportingValue"("submissionId", "key");

-- CreateIndex
CREATE INDEX "CompanyReportingQuestion_submissionId_status_idx" ON "CompanyReportingQuestion"("submissionId", "status");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_organisationId_readAt_idx" ON "Notification"("organisationId", "readAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_createdAt_idx" ON "IdempotencyRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_key_userId_key" ON "IdempotencyRecord"("key", "userId");

-- AddForeignKey
ALTER TABLE "OrganisationMembership" ADD CONSTRAINT "OrganisationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationMembership" ADD CONSTRAINT "OrganisationMembership_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationMembership" ADD CONSTRAINT "OrganisationMembership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investor" ADD CONSTRAINT "Investor_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investor" ADD CONSTRAINT "Investor_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "InvestorApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investor" ADD CONSTRAINT "Investor_relationshipManagerId_fkey" FOREIGN KEY ("relationshipManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficialOwner" ADD CONSTRAINT "BeneficialOwner_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "InvestorApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficialOwner" ADD CONSTRAINT "BeneficialOwner_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorisedSignatory" ADD CONSTRAINT "AuthorisedSignatory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "InvestorApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorisedSignatory" ADD CONSTRAINT "AuthorisedSignatory_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestorDeclaration" ADD CONSTRAINT "InvestorDeclaration_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "InvestorApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestorDeclaration" ADD CONSTRAINT "InvestorDeclaration_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationNote" ADD CONSTRAINT "ApplicationNote_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "InvestorApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerOrgId_fkey" FOREIGN KEY ("ownerOrgId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "PortfolioCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "InvestorApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CompanyReportingSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentBlob" ADD CONSTRAINT "DocumentBlob_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentAccount" ADD CONSTRAINT "InvestmentAccount_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentAccount" ADD CONSTRAINT "InvestmentAccount_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InvestmentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_securityId_fkey" FOREIGN KEY ("securityId") REFERENCES "Security"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioValuation" ADD CONSTRAINT "PortfolioValuation_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InvestmentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalCall" ADD CONSTRAINT "CapitalCall_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalCallAcknowledgement" ADD CONSTRAINT "CapitalCallAcknowledgement_capitalCallId_fkey" FOREIGN KEY ("capitalCallId") REFERENCES "CapitalCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalCallAcknowledgement" ADD CONSTRAINT "CapitalCallAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodianAccount" ADD CONSTRAINT "CustodianAccount_custodianOrgId_fkey" FOREIGN KEY ("custodianOrgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodianAccount" ADD CONSTRAINT "CustodianAccount_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodianExecution" ADD CONSTRAINT "CustodianExecution_custodianAccountId_fkey" FOREIGN KEY ("custodianAccountId") REFERENCES "CustodianAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodianDayEndSubmission" ADD CONSTRAINT "CustodianDayEndSubmission_custodianAccountId_fkey" FOREIGN KEY ("custodianAccountId") REFERENCES "CustodianAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationItem" ADD CONSTRAINT "ReconciliationItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ReconciliationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationItem" ADD CONSTRAINT "ReconciliationItem_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "CustodianExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationItem" ADD CONSTRAINT "ReconciliationItem_dayEndId_fkey" FOREIGN KEY ("dayEndId") REFERENCES "CustodianDayEndSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationItem" ADD CONSTRAINT "ReconciliationItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "InvestmentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationItem" ADD CONSTRAINT "ReconciliationItem_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ReconciliationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioCompany" ADD CONSTRAINT "PortfolioCompany_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingPeriod" ADD CONSTRAINT "ReportingPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "PortfolioCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingRequirement" ADD CONSTRAINT "ReportingRequirement_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ReportingPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyReportingSubmission" ADD CONSTRAINT "CompanyReportingSubmission_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ReportingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyReportingSubmission" ADD CONSTRAINT "CompanyReportingSubmission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "PortfolioCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyReportingValue" ADD CONSTRAINT "CompanyReportingValue_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CompanyReportingSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyReportingQuestion" ADD CONSTRAINT "CompanyReportingQuestion_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CompanyReportingSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- AuditEvent is append-only (UAT AUD-002): reject UPDATE, DELETE and TRUNCATE.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION nexus_audit_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent rows are immutable (% not permitted)', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_no_update_delete
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION nexus_audit_immutable();

CREATE TRIGGER audit_event_no_truncate
  BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION nexus_audit_immutable();