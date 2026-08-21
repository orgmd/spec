import type { Diagnostic } from "../diagnostics/types.js";

export function renderDiagnostics(diagnostics: readonly Diagnostic[]): string {
  return (
    diagnostics
      .map(
        (item) =>
          `${item.severity} ${item.code}: ${item.message}${item.path === undefined ? "" : ` (${item.path})`}`,
      )
      .join("\n") + (diagnostics.length === 0 ? "" : "\n")
  );
}
export function renderJson(
  command: string,
  ok: boolean,
  diagnostics: readonly Diagnostic[],
  extra: Readonly<Record<string, unknown>> = {},
): string {
  return `${JSON.stringify({ command, ok, diagnostics, ...extra })}\n`;
}
export const HELP = `Usage: orgmd <command> [options]\n\nCommands:\n  validate [path] [--json]\n  compile [path] (--target agents-md|prompt | --all) [--clearance a,b] [--today YYYY-MM-DD] [--output path] [--json]\n  doctor [path] --today YYYY-MM-DD [--json]\n  init [path] --non-interactive --organization NAME --tone TEXT --policy TEXT --action ACTION --effect allow|escalate|deny --editor ROLE --owner ROLE --revisit YYYY-MM-DD --today YYYY-MM-DD [--write] [--preview] [--overwrite]\n  adopt <source> [path] [--write --confirm candidate.field=value] [--json]\n\nExit codes: 0 success, 1 semantic failure, 2 invocation or filesystem failure.\n`;
