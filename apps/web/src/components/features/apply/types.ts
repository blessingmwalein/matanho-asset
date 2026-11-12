import type { ApplicationPayload, ApplicationStatus, ReadinessResult } from '@nexus/shared';

export interface SlotDocument {
  documentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  versionNo: number;
  versions: Array<{ versionNo: number; fileName: string; sizeBytes: number; uploadedAt: string }>;
}

export interface RequestedInfo {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
}

/** GET /public/applications/:reference */
export interface ApplicationView {
  reference: string;
  status: ApplicationStatus;
  step: number;
  payload: Partial<ApplicationPayload>;
  documents: Record<string, SlotDocument>;
  requestedInfo: RequestedInfo[];
  readiness: ReadinessResult;
  submittedAt: string | null;
  lastSavedAt: string;
}

export interface DraftIdentity {
  reference: string;
  token: string;
}

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** Props shared by the form steps. The wizard owns the draft; a step only reports its values up. */
export interface StepProps {
  payload: Partial<ApplicationPayload>;
  /** called with the step form's current values on every change (autosave + live readiness) */
  onValues: (values: Record<string, unknown>) => void;
  /** a step registers its validator so Continue can validate before moving on */
  registerValidator: (fn: () => Promise<boolean>) => void;
  disabled?: boolean;
}
