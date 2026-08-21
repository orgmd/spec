import type { OperationResult } from "../diagnostics/types.js";

export type CompileTarget = "agents-md" | "prompt";

export interface CompiledProjection {
  readonly target: CompileTarget;
  readonly profile: "orgmd-agents-md-v1" | "orgmd-prompt-v1";
  readonly content: string;
}

export type CompileResult = OperationResult<CompiledProjection>;
