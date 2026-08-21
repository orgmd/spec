import type { OperationResult } from "../diagnostics/types.js";

export type AdoptDomain = "identity" | "glossary" | "policy";
export type AdoptConfirmationField =
  "owner" | "scope" | "revisit" | "action" | "effect" | "route";

export interface AdoptCandidate {
  readonly candidateId: string;
  readonly sourceHeading: string;
  readonly sourceText: string;
  readonly status: "draft";
  /** A deterministic label only; it does not assert semantic meaning. */
  readonly suggestedDomain: AdoptDomain;
  readonly requiredInputs: readonly AdoptConfirmationField[];
}

export interface AdoptInput {
  readonly sourcePath: string;
  readonly sourceText: string;
  /** Existing validated bundle that will receive confirmed draft revisions. */
  readonly target?: string;
}

export interface AdoptPreview {
  readonly sourcePath: string;
  readonly target?: string;
  readonly candidates: readonly AdoptCandidate[];
  readonly rendered: string;
}

export interface AdoptConfirmations {
  readonly byCandidateId: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
}

export type AdoptPreviewResult = OperationResult<AdoptPreview>;
