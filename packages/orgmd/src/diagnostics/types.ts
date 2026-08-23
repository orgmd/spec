export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  readonly code: string;
  readonly severity: Severity;
  readonly message: string;
  readonly path?: string;
  readonly line?: number;
  readonly column?: number;
  readonly entryId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OperationResult<T> {
  readonly value?: T;
  readonly diagnostics: readonly Diagnostic[];
}
