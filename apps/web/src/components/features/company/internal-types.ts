import type { CertificateStatus, CompanySubmissionStatus } from '@nexus/shared';
import type { FileDoc, QuestionView } from './types';

export interface CompanyRow {
  id: string;
  ref: string;
  name: string;
  sector: string | null;
  country: string | null;
  fundName: string | null;
  status: string;
  currentPeriod: { id: string; label: string; dueDate: string } | null;
  submission: { id: string | null; status: CompanySubmissionStatus; completionPct: number; version: number } | null;
  openQuestions: number;
  lastSubmittedAt: string | null;
  periodsCount: number;
}

export interface CompanyDetail {
  id: string;
  ref: string;
  name: string;
  legalName: string | null;
  email: string | null;
  sector: string | null;
  country: string | null;
  fundName: string | null;
  description: string | null;
  status: string;
  periods: Array<{
    id: string;
    label: string;
    periodEnd: string;
    dueDate: string;
    periodStatus: string;
    submissionId: string | null;
    status: CompanySubmissionStatus;
    version: number;
    completionPct: number;
    submittedAt: string | null;
    openQuestions: number;
  }>;
}

export interface SubmissionListRow {
  id: string;
  ref: string;
  company: { id: string; name: string };
  period: { id: string; label: string; dueDate: string };
  status: CompanySubmissionStatus;
  version: number;
  completionPct: number;
  submittedAt: string | null;
  submittedByName: string | null;
  reviewedAt: string | null;
  openQuestions: number;
  answeredQuestions: number;
}

export interface ReviewSection {
  key: string;
  category: string;
  title: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE';
  complete: boolean;
  missing: string[];
  fields: Array<{ key: string; label: string; type: 'money' | 'number' | 'percent' | 'text' | 'textarea' | 'date'; group: string | null; required: boolean; value: unknown }>;
  repeaters: Array<{ key: string; label: string; columns: Array<{ key: string; label: string; type: 'text' | 'money' | 'number' | 'date' | 'select' }>; rows: Array<Record<string, unknown>> }>;
  files: Array<{ key: string; label: string; required: boolean; documents: FileDoc[] }>;
}

export interface ReviewDetail {
  id: string;
  ref: string;
  status: CompanySubmissionStatus;
  version: number;
  completionPct: number;
  completion: { percent: number; total: number; done: number; complete: boolean; outstanding: string[] };
  submittedAt: string | null;
  submittedByName: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  company: { id: string; ref: string; name: string; sector: string | null; country: string | null; fundName: string | null };
  period: { id: string; label: string; periodStart: string; periodEnd: string; dueDate: string; status: string };
  currency: string;
  sections: ReviewSection[];
  certificates: CertificateStatus;
  questions: QuestionView[];
  openQuestions: number;
  canReview: boolean;
  canAccept: boolean;
  timeline: Array<{ id: string; title: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; body?: string; at: string; actor: string | null }>;
}
