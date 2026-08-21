import { compareUtf8Bytes, sortDiagnostics } from "../diagnostics/sort.js";
import type { Diagnostic } from "../diagnostics/types.js";
import type { ValidatedBundle } from "../model/types.js";
import { logicalNodePath } from "./nodes.js";
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
    const bundle = path[index] as unknown;
    if (!isReachableBundleNode(bundle)) {
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
    const nodePath = logicalNodePath(bundle);
    const bundleId = bundle.metadata.bundle ?? bundle.reference;
    if (paths.has(nodePath) || bundleIds.has(bundleId)) {
      return sortDiagnostics([
        {
          code: "resolution.duplicate-path",
          severity: "error",
          message:
            "The designated path contains the same bundle more than once.",
          path: nodePath,
          details: { bundle: bundleId },
        },
      ]);
    }
    paths.add(nodePath);
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

function isReachableBundleNode(value: unknown): value is ValidatedBundle {
  if (typeof value !== "object" || value === null) return false;
  const node = value as Partial<ValidatedBundle>;
  return (
    typeof node.reference === "string" &&
    typeof node.path === "string" &&
    (node.nodePath === undefined || typeof node.nodePath === "string") &&
    typeof node.isRoot === "boolean" &&
    typeof node.metadata === "object" &&
    node.metadata !== null &&
    typeof node.metadata.lifecycle === "object" &&
    node.metadata.lifecycle !== null &&
    Array.isArray(node.entries)
  );
}

export function entrySemanticErrors(
  selections: readonly RevisionSelection[],
  path: readonly ValidatedBundle[],
  lattice: ScopeLattice,
): readonly ResolutionError[] {
  const errors: ResolutionError[] = [];
  const kinds = new Map<
    string,
    {
      readonly kind: "definition" | "constraint";
      readonly selection: RevisionSelection;
    }
  >();
  const unknownScopeIds = new Set<string>();
  for (const selection of selections) {
    const revision = selection.revision;
    if (!revision) continue;
    const selectedBundle = path[selection.bundleIndex];
    const node = selectedBundle ? logicalNodePath(selectedBundle) : "";
    const kind = revision.domain === "policy" ? "constraint" : "definition";
    const prior = kinds.get(revision.id);
    if (prior === undefined) {
      kinds.set(revision.id, { kind, selection });
    } else if (prior.kind !== kind) {
      const priorBundle = path[prior.selection.bundleIndex];
      const conflicts = Object.freeze([
        Object.freeze({
          bundle: priorBundle?.metadata.bundle ?? priorBundle?.reference ?? "",
          id: revision.id,
        }),
        Object.freeze({
          bundle:
            selectedBundle?.metadata.bundle ?? selectedBundle?.reference ?? "",
          id: revision.id,
        }),
      ]);
      errors.push({
        code: "kind_mismatch",
        node,
        id: revision.id,
        detail:
          "One id appears as both a definition and a constraint across the reported bundles.",
        conflicts,
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
        selectionNodePath(selection, path) === error.node,
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

export function renderResolutionDiagnostics(
  diagnostics: readonly Diagnostic[],
  selections: readonly RevisionSelection[],
  path: readonly ValidatedBundle[],
  lattice: ScopeLattice,
  clearance: readonly string[],
): readonly Diagnostic[] {
  const rendered = diagnostics.map((diagnostic): Diagnostic => {
    if (!diagnostic.entryId || !diagnostic.path) {
      return Object.freeze({ ...diagnostic });
    }
    const contributor = selections.find(
      (selection) =>
        selection.id === diagnostic.entryId &&
        selectionNodePath(selection, path) === diagnostic.path,
    );
    const visible =
      contributor?.revision !== undefined &&
      lattice.visible(contributor.revision.scope, clearance);
    if (visible) return Object.freeze({ ...diagnostic });
    return Object.freeze({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message:
        diagnostic.code === "resolution.unauthorised-shadow"
          ? "An authority entry above this clearance was discarded."
          : "Authority delegation above this clearance was ignored.",
      path: diagnostic.path,
    });
  });
  return sortDiagnostics(rendered);
}

function selectionNodePath(
  selection: RevisionSelection,
  path: readonly ValidatedBundle[],
): string | undefined {
  const bundle = path[selection.bundleIndex];
  return bundle ? logicalNodePath(bundle) : undefined;
}
