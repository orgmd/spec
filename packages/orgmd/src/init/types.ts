import type { OperationResult } from "../diagnostics/types.js";

export interface InitInput {
  readonly target: string;
  readonly organizationName: string;
  readonly tone: string;
  readonly disputedTerms: readonly string[];
  readonly policyText: string;
  readonly policyAction: string;
  readonly policyEffect: "allow" | "escalate" | "deny";
  readonly policyRoute?: string;
  readonly editorRole: string;
  readonly policyOwner: string;
  readonly revisit: string;
  readonly today: string;
  readonly overwrite?: boolean;
}

export interface InitPlanFile {
  readonly relativePath: "org.md" | "ownership.md" | "policies.md";
  readonly content: string;
}

export interface InitPlan {
  readonly target: string;
  readonly files: readonly InitPlanFile[];
  readonly preview: string;
  /** The caller-injected doctor date used to validate this exact plan. */
  readonly today: string;
  /** Captures the explicit permission that was checked during planning. */
  readonly overwrite: boolean;
}

export type InitPlanResult = OperationResult<InitPlan>;
