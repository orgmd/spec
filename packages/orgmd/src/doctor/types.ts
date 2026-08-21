import type { Diagnostic } from "../diagnostics/types.js";
import type { Domain, ValidatedBundle } from "../model/types.js";
import type { ResolvedContext } from "../resolver/types.js";

export interface DoctorFinding extends Diagnostic {
  readonly blocking: boolean;
}

export interface DoctorInput {
  readonly bundle: ValidatedBundle;
  readonly context?: ResolvedContext;
  readonly today: string;
}

export interface DomainRatio {
  readonly domain: Domain;
  readonly native: number;
  readonly synced: number;
  readonly syncedPercent: number;
}

export interface DoctorReport {
  readonly findings: readonly DoctorFinding[];
  readonly ratios: readonly DomainRatio[];
  readonly pendingRevisions: number;
}
