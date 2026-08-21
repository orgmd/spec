import { compareUtf8Bytes, sortDiagnostics } from "../diagnostics/sort.js";
import type { Diagnostic, OperationResult } from "../diagnostics/types.js";
import type { BundleMetadata } from "../model/types.js";

const DEFAULT_EDGES = Object.freeze([
  ["restricted", "internal"],
  ["internal", "public"],
] as const);

const DEFAULT_LABELS = Object.freeze(["internal", "public", "restricted"]);

export interface ScopeLattice {
  readonly labels: ReadonlySet<string>;
  narrowerOrEqual(left: string, right: string): boolean;
  visible(scope: string, clearance: readonly string[]): boolean;
}

export function createScopeLattice(
  declarations: BundleMetadata["scopes"],
): OperationResult<ScopeLattice> {
  const labels = new Set(DEFAULT_LABELS);
  for (const label of Object.keys(declarations ?? {})) labels.add(label);

  const edges = new Map<string, Set<string>>();
  for (const label of labels) edges.set(label, new Set());
  for (const [narrower, wider] of DEFAULT_EDGES) {
    edges.get(narrower)?.add(wider);
  }

  const diagnostics: Diagnostic[] = [];
  for (const [label, declaration] of Object.entries(declarations ?? {}).sort(
    ([left], [right]) => compareUtf8Bytes(left, right),
  )) {
    for (const wider of [...declaration.narrower_than].sort(compareUtf8Bytes)) {
      if (!labels.has(wider)) {
        diagnostics.push({
          code: "resolution.unknown-scope",
          severity: "error",
          message: `Scope ${JSON.stringify(label)} references undeclared scope ${JSON.stringify(wider)}.`,
          entryId: label,
          details: { scope: label, narrowerThan: wider },
        });
        continue;
      }
      edges.get(label)?.add(wider);
    }
  }

  if (diagnostics.length === 0 && containsCycle(edges)) {
    diagnostics.push({
      code: "resolution.scope-cycle",
      severity: "error",
      message: "The scope narrower-than graph contains a cycle.",
    });
  }
  if (diagnostics.length > 0) {
    return { diagnostics: sortDiagnostics(diagnostics) };
  }

  const closure = new Map<string, ReadonlySet<string>>();
  for (const label of labels) {
    const reachable = new Set<string>([label]);
    const pending = [...(edges.get(label) ?? [])];
    while (pending.length > 0) {
      const next = pending.pop();
      if (next === undefined || reachable.has(next)) continue;
      reachable.add(next);
      pending.push(...(edges.get(next) ?? []));
    }
    closure.set(label, reachable);
  }

  const readonlyLabels = new Set([...labels].sort(compareUtf8Bytes));
  const lattice: ScopeLattice = Object.freeze({
    labels: readonlyLabels,
    narrowerOrEqual(left: string, right: string): boolean {
      return closure.get(left)?.has(right) ?? false;
    },
    visible(scope: string, clearance: readonly string[]): boolean {
      return clearance.some((label) => closure.get(label)?.has(scope) ?? false);
    },
  });
  return { value: lattice, diagnostics: Object.freeze([]) };
}

function containsCycle(
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(label: string): boolean {
    if (visiting.has(label)) return true;
    if (visited.has(label)) return false;
    visiting.add(label);
    for (const next of edges.get(label) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(label);
    visited.add(label);
    return false;
  }

  return [...edges.keys()].some(visit);
}
