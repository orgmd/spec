import type { Diagnostic } from "./types.js";

export function compareUtf8Bytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function compareOptionalStrings(
  left: string | undefined,
  right: string | undefined,
): number {
  return compareUtf8Bytes(left ?? "", right ?? "");
}

function compareOptionalNumbers(
  left: number | undefined,
  right: number | undefined,
): number {
  return (left ?? 0) - (right ?? 0);
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return (
    compareOptionalStrings(left.path, right.path) ||
    compareOptionalNumbers(left.line, right.line) ||
    compareOptionalNumbers(left.column, right.column) ||
    compareOptionalStrings(left.entryId, right.entryId) ||
    compareUtf8Bytes(left.code, right.code)
  );
}

export function sortDiagnostics(
  diagnostics: readonly Diagnostic[],
): readonly Diagnostic[] {
  return Object.freeze([...diagnostics].sort(compareDiagnostics));
}
