import type { Diagnostic } from "../diagnostics/types.js";

const operationalCodes = new Set([
  "bundle.invalid-reference",
  "bundle.read-error",
  "cli.discovery-failed",
  "cli.invalid-path",
  "init.invalid-parent",
  "init.invalid-target",
  "init.symlink-target",
  "init.validation-failed",
  "init.write-failed",
  "init.rollback-failed",
  "adopt.missing-target",
  "adopt.invalid-target",
  "adopt.source-inside-target",
  "adopt.write-failed",
  "adopt.rollback-failed",
  "adopt.cleanup-failed",
]);

export function exitForDiagnostics(diagnostics: readonly Diagnostic[]): 1 | 2 {
  return diagnostics.some(
    ({ code }) => code.startsWith("io.") || operationalCodes.has(code),
  )
    ? 2
    : 1;
}
