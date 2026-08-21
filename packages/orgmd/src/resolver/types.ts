import type { Diagnostic, OperationResult } from "../diagnostics/types.js";
import type { BundleVersion } from "../identifiers/context-id.js";
import type { EntryRevision, ValidatedBundle } from "../model/types.js";

export interface ResolveRequest {
  readonly path: readonly ValidatedBundle[];
  readonly clearance: readonly string[];
  readonly anonymous?: boolean;
  readonly today: string;
}

export interface WithheldMarker {
  readonly withheld: true;
  readonly reason: "clearance";
}

export interface ResolutionError {
  readonly code: string;
  readonly node: string;
  readonly id?: string;
  readonly id_withheld?: true;
  readonly detail: string;
  readonly conflicts?: readonly {
    readonly bundle: string;
    readonly id: string;
  }[];
}

export type StaleReason = "revisit" | "owner" | "upstream";

export interface ResolvedEntry {
  readonly revision: EntryRevision;
  readonly bundleIndex: number;
  readonly contested: boolean;
  readonly staleReasons: readonly StaleReason[];
}

export interface ResolvedContext {
  readonly entries: readonly (ResolvedEntry | WithheldMarker)[];
  readonly bundles: readonly BundleVersion[];
  readonly contextId: string;
  readonly resolutionErrors: readonly ResolutionError[];
  readonly diagnostics: readonly Diagnostic[];
}

export type ResolveResult = OperationResult<ResolvedContext>;
