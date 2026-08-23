import { compareUtf8Bytes, sortDiagnostics } from "../diagnostics/sort.js";
import type { Diagnostic } from "../diagnostics/types.js";
import type { BundleFailure } from "../identifiers/context-id.js";
import { isLogicalNodePath } from "../bundle/node-path.js";
import type { EntryRevision, ValidatedBundle } from "../model/types.js";
import { isCalendarDate } from "../validation/calendar-date.js";
import { validateEntrySchema } from "../validation/schema.js";
import {
  isLifecycleRecord,
  validateEntrySemanticValues,
} from "../validation/semantic.js";
import { logicalNodePath } from "./nodes.js";
import type { RevisionSelection } from "./revisions.js";
import type { ScopeLattice } from "./scopes.js";
import type {
  ResolutionError,
  ResolvedEntry,
  ResolveRequest,
} from "./types.js";

export function isResolveRequestEnvelope(
  value: unknown,
): value is ResolveRequest {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.path) &&
    Array.isArray(value.clearance) &&
    value.clearance.every((label) => typeof label === "string") &&
    typeof value.today === "string" &&
    isCalendarDate(value.today) &&
    (value.anonymous === undefined || typeof value.anonymous === "boolean") &&
    (value.bundleFailures === undefined || Array.isArray(value.bundleFailures))
  );
}

export function normalizeBundleFailures(
  value: unknown,
  pathLength: number,
): readonly BundleFailure[] | undefined {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) return undefined;
  const normalized: BundleFailure[] = [];
  const indexes = new Set<number>();
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) return undefined;
    const failure = value[index];
    if (
      !isRecord(failure) ||
      !Number.isInteger(failure.bundleIndex) ||
      (failure.bundleIndex as number) < 0 ||
      (failure.bundleIndex as number) >= pathLength ||
      (failure.code !== "unparseable_bundle" &&
        failure.code !== "integrity_failure") ||
      typeof failure.detail !== "string" ||
      failure.detail.trim().length === 0 ||
      indexes.has(failure.bundleIndex as number)
    ) {
      return undefined;
    }
    indexes.add(failure.bundleIndex as number);
    normalized.push(
      Object.freeze({
        bundleIndex: failure.bundleIndex as number,
        code: failure.code,
        detail: failure.detail,
      }),
    );
  }
  return Object.freeze(
    normalized.sort(
      (left, right) =>
        left.bundleIndex - right.bundleIndex ||
        compareUtf8Bytes(left.code, right.code) ||
        compareUtf8Bytes(left.detail, right.detail),
    ),
  );
}

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
  const physicalPaths = new Set<string>();
  const bundleIds = new Set<string>();
  for (let index = 0; index < path.length; index += 1) {
    const bundle = path[index];
    if (!bundle) continue;
    if (!isValidBundlePayload(bundle)) {
      return invalidBundleDiagnostic(index);
    }
    const nodePath = logicalNodePath(bundle);
    if (nodePath.length === 0) {
      return invalidBundleDiagnostic(index);
    }
    const bundleId = bundle.metadata.bundle ?? bundle.reference;
    if (
      paths.has(nodePath) ||
      physicalPaths.has(bundle.path) ||
      bundleIds.has(bundleId)
    ) {
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
    physicalPaths.add(bundle.path);
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

function isValidBundlePayload(bundle: ValidatedBundle): boolean {
  if (
    bundle.reference.length === 0 ||
    logicalNodePath(bundle).length === 0 ||
    (!bundle.isRoot &&
      (bundle.metadata.scopes !== undefined ||
        bundle.metadata.graceDays !== undefined))
  ) {
    return false;
  }
  const metadata = bundle.metadata;
  if (
    (metadata.bundle !== undefined &&
      (typeof metadata.bundle !== "string" || metadata.bundle.length === 0)) ||
    !isValidLifecycle(metadata.lifecycle, bundle.entries) ||
    (metadata.scopes !== undefined && !isValidScopes(metadata.scopes)) ||
    (metadata.graceDays !== undefined &&
      (!Number.isInteger(metadata.graceDays) ||
        metadata.graceDays < 0 ||
        metadata.graceDays > 90))
  ) {
    return false;
  }
  for (let index = 0; index < bundle.entries.length; index += 1) {
    if (!(index in bundle.entries)) return false;
    if (!isValidEntryRevisionShape(bundle.entries[index])) return false;
  }
  return true;
}

function invalidBundleDiagnostic(index: number): readonly Diagnostic[] {
  return sortDiagnostics([
    {
      code: "resolution.invalid-request",
      severity: "error",
      message: `Node ${String(index)} contains malformed validated bundle data.`,
      details: { index },
    },
  ]);
}

function isValidLifecycle(
  value: unknown,
  entries: readonly EntryRevision[],
): boolean {
  if (!isRecord(value)) return false;
  const entryIds = new Set(
    entries.flatMap((entry) =>
      isRecord(entry) && typeof entry.id === "string" ? [entry.id] : [],
    ),
  );
  return Object.entries(value).every(
    ([id, record]) => entryIds.has(id) && isLifecycleRecord(record),
  );
}

function isValidScopes(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (declaration) =>
        isRecord(declaration) &&
        Array.isArray(declaration.narrower_than) &&
        declaration.narrower_than.every(
          (label) => typeof label === "string" && label.length > 0,
        ),
    )
  );
}

function isValidEntryRevisionShape(value: unknown): value is EntryRevision {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    typeof value.owner !== "string" ||
    typeof value.scope !== "string" ||
    (value.status !== "draft" &&
      value.status !== "approved" &&
      value.status !== "rejected") ||
    typeof value.source !== "string" ||
    !Number.isInteger(value.rev) ||
    typeof value.domain !== "string" ||
    typeof value.body !== "string" ||
    typeof value.sourcePath !== "string" ||
    !Number.isInteger(value.line) ||
    !isRecord(value.extra)
  ) {
    return false;
  }
  if (
    (value.revisit !== undefined && typeof value.revisit !== "string") ||
    (value.ref !== undefined && typeof value.ref !== "string") ||
    (value.upstream !== undefined && !isRecord(value.upstream)) ||
    (value.action !== undefined && typeof value.action !== "string") ||
    (value.effect !== undefined &&
      value.effect !== "allow" &&
      value.effect !== "escalate" &&
      value.effect !== "deny") ||
    (value.route !== undefined && typeof value.route !== "string")
  ) {
    return false;
  }
  if (!(
    value.delegates === undefined ||
    (Array.isArray(value.delegates) &&
      value.delegates.every(
        (delegate) =>
          typeof delegate === "string" && isLogicalNodePath(delegate),
      ))
  )) {
    return false;
  }

  const frontMatter = normalizedFrontMatter(value as unknown as EntryRevision);
  const schemaDiagnostics = validateEntrySchema(frontMatter);
  const semanticDiagnostics = validateEntrySemanticValues(
    value.domain,
    frontMatter,
  );
  return (
    schemaDiagnostics.every((diagnostic) =>
      isResolverScopedSchemaDiagnostic(diagnostic, value),
    ) &&
    semanticDiagnostics.every(
      (diagnostic) =>
        diagnostic.severity !== "error" ||
        isResolverScopedSemanticDiagnostic(diagnostic, value),
    )
  );
}

function normalizedFrontMatter(
  entry: EntryRevision,
): Readonly<Record<string, unknown>> {
  return {
    ...entry.extra,
    id: entry.id,
    owner: entry.owner,
    scope: entry.scope,
    status: entry.status,
    source: entry.source,
    rev: entry.rev,
    ...(entry.revisit === undefined ? {} : { revisit: entry.revisit }),
    ...(entry.ref === undefined ? {} : { ref: entry.ref }),
    ...(entry.upstream === undefined ? {} : { upstream: entry.upstream }),
    ...(entry.action === undefined ? {} : { action: entry.action }),
    ...(entry.effect === undefined ? {} : { effect: entry.effect }),
    ...(entry.route === undefined ? {} : { route: entry.route }),
    ...(entry.delegates === undefined ? {} : { delegates: entry.delegates }),
  };
}

function isResolverScopedSchemaDiagnostic(
  diagnostic: Diagnostic,
  entry: Readonly<Record<string, unknown>>,
): boolean {
  if (entry.domain !== "policy") return false;
  if (diagnostic.code === "invalid_action") return true;
  return (
    diagnostic.code === "invalid_entry" &&
    diagnostic.details?.keyword === "required" &&
    diagnostic.details?.missingProperty === "route" &&
    entry.effect === "escalate"
  );
}

function isResolverScopedSemanticDiagnostic(
  diagnostic: Diagnostic,
  entry: Readonly<Record<string, unknown>>,
): boolean {
  return entry.domain === "policy" && diagnostic.code === "invalid_entry";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  visibleBundleIdentifiers: ReadonlySet<string> = new Set(),
): readonly ResolutionError[] {
  const rendered = errors.map((error): ResolutionError => {
    if (!error.id) return Object.freeze({ ...error });
    const contributor = selections.find(
      (selection) =>
        selection.id === error.id &&
        selectionNodePath(selection, path) === error.node,
    );
    const visible =
      visibleBundleIdentifiers.has(`${error.node}\0${error.id}`) ||
      (contributor?.revision !== undefined &&
        lattice.visible(contributor.revision.scope, clearance));
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
  effectiveAuthority: readonly ResolvedEntry[],
  lattice: ScopeLattice,
  clearance: readonly string[],
): readonly Diagnostic[] {
  const rendered = diagnostics.map((diagnostic): Diagnostic => {
    if (!diagnostic.entryId || !diagnostic.path) {
      return Object.freeze({ ...diagnostic });
    }
    const effective = effectiveAuthority.find(
      (entry) => entry.revision.id === diagnostic.entryId,
    );
    const visible =
      effective !== undefined &&
      lattice.visible(effective.revision.scope, clearance);
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
