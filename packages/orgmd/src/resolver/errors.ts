import { compareUtf8Bytes, sortDiagnostics } from "../diagnostics/sort.js";
import type { Diagnostic } from "../diagnostics/types.js";
import type { ValidatedBundle } from "../model/types.js";
import type { RevisionSelection } from "./revisions.js";
import type { ScopeLattice } from "./scopes.js";
import type { ResolutionError, ResolveRequest } from "./types.js";

export function validateResolutionPath(
  path: ResolveRequest["path"],
): readonly Diagnostic[] {
  if (!Array.isArray(path) || path.length === 0) {
    return sortDiagnostics([
      {
        code: "resolution.ambiguous-path",
        severity: "error",
        message: "Resolution requires exactly one non-empty designated path.",
      },
    ]);
  }

  for (let index = 0; index < path.length; index += 1) {
    const bundle = path[index] as ValidatedBundle | undefined;
    if (!bundle || typeof bundle !== "object") {
      return sortDiagnostics([
        {
          code: "unreachable_node",
          severity: "error",
          message: `Node ${String(index)} on the designated path is unreachable.`,
          details: { index },
        },
      ]);
    }
  }

  const paths = new Set<string>();
  const bundleIds = new Set<string>();
  for (const bundle of path) {
    const bundleId = bundle.metadata.bundle ?? bundle.reference;
    if (paths.has(bundle.path) || bundleIds.has(bundleId)) {
      return sortDiagnostics([
        {
          code: "resolution.duplicate-path",
          severity: "error",
          message:
            "The designated path contains the same bundle more than once.",
          path: bundle.path,
          details: { bundle: bundleId },
        },
      ]);
    }
    paths.add(bundle.path);
    bundleIds.add(bundleId);
  }

  if (!path[0]?.isRoot || path.slice(1).some(({ isRoot }) => isRoot)) {
    return sortDiagnostics([
      {
        code: "resolution.invalid-path",
        severity: "error",
        message:
          "The designated path must start with one root and contain only non-root descendants after it.",
      },
    ]);
  }
  return Object.freeze([]);
}

export function entrySemanticErrors(
  selections: readonly RevisionSelection[],
  path: readonly ValidatedBundle[],
  lattice: ScopeLattice,
): readonly ResolutionError[] {
  const errors: ResolutionError[] = [];
  const kinds = new Map<string, "definition" | "constraint">();
  const unknownScopeIds = new Set<string>();
  for (const selection of selections) {
    const revision = selection.revision;
    if (!revision) continue;
    const node = path[selection.bundleIndex]?.path ?? "";
    const kind = revision.domain === "policy" ? "constraint" : "definition";
    const prior = kinds.get(revision.id);
    if (prior === undefined) {
      kinds.set(revision.id, kind);
    } else if (prior !== kind) {
      errors.push({
        code: "kind_mismatch",
        node,
        id: revision.id,
        detail: "One id appears as both a definition and a constraint.",
      });
    }
    if (
      !lattice.labels.has(revision.scope) &&
      !unknownScopeIds.has(revision.id)
    ) {
      errors.push({
        code: "unknown_scope",
        node,
        id: revision.id,
        detail: "An entry uses a scope not declared by the root bundle.",
      });
      unknownScopeIds.add(revision.id);
    }
  }
  return Object.freeze(errors);
}

export function blockedEntryIds(
  errors: readonly ResolutionError[],
): ReadonlySet<string> {
  return new Set(errors.flatMap((error) => (error.id ? [error.id] : [])));
}

export function renderResolutionErrors(
  errors: readonly ResolutionError[],
  selections: readonly RevisionSelection[],
  path: readonly ValidatedBundle[],
  lattice: ScopeLattice,
  clearance: readonly string[],
): readonly ResolutionError[] {
  const rendered = errors.map((error): ResolutionError => {
    if (!error.id) return Object.freeze({ ...error });
    const contributor = selections.find(
      (selection) =>
        selection.id === error.id &&
        path[selection.bundleIndex]?.path === error.node,
    );
    const visible =
      contributor?.revision !== undefined &&
      lattice.visible(contributor.revision.scope, clearance);
    return visible
      ? Object.freeze({ ...error })
      : Object.freeze({
          code: error.code,
          node: error.node,
          id_withheld: true as const,
          detail: error.detail,
        });
  });
  return Object.freeze(
    rendered.sort(
      (left, right) =>
        compareUtf8Bytes(left.node, right.node) ||
        compareUtf8Bytes(left.id ?? "", right.id ?? "") ||
        compareUtf8Bytes(left.code, right.code),
    ),
  );
}
