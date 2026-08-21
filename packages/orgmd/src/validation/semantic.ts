import type { Diagnostic } from "../diagnostics/types.js";
import type {
  Bundle,
  BundleMetadata,
  LifecycleRecord,
  ParsedEntryRevision,
} from "../model/types.js";
import { validateEntrySchema } from "./schema.js";

const DEFAULT_SCOPES = new Set(["public", "internal", "restricted"]);
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9][A-Za-z0-9_-]*)*$/;
const ROOT_ONLY_METADATA_KEYS = ["scopes", "grace_days"] as const;
const BUNDLE_METADATA_KEYS = [...ROOT_ONLY_METADATA_KEYS, "lifecycle"] as const;

export function validateRevisionSchemas(bundle: Bundle): readonly Diagnostic[] {
  return bundle.entries.flatMap((entry) =>
    validateEntrySchema(entry.frontMatter).map((diagnostic) => ({
      ...diagnostic,
      path: entry.sourcePath,
      line: entry.line,
    })),
  );
}

export function validateRevisionSets(bundle: Bundle): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const revisions = new Set<string>();
  const domains = new Map<string, string>();
  for (const entry of bundle.entries) {
    const { id, rev } = entry.frontMatter;
    if (typeof id !== "string" || !Number.isInteger(rev)) continue;
    const key = `${id}\0${String(rev)}`;
    if (revisions.has(key)) {
      diagnostics.push(
        entryDiagnostic(
          entry,
          "validation.duplicate-rev",
          `Entry ${JSON.stringify(id)} repeats revision ${String(rev)}.`,
        ),
      );
    } else {
      revisions.add(key);
    }
    const domain = domains.get(id);
    if (domain === undefined) {
      domains.set(id, entry.domain);
    } else if (domain !== entry.domain) {
      diagnostics.push(
        entryDiagnostic(
          entry,
          "kind_mismatch",
          `Revisions of ${JSON.stringify(id)} cross semantic domains.`,
        ),
      );
    }
  }
  return diagnostics;
}

export function validateDomainRules(
  bundle: Bundle,
  isRoot: boolean,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const ownershipRoutes = resolvableOwnershipRoutes(
    bundle.entries,
    retiredIds(bundle),
  );

  for (const entry of bundle.entries) {
    const values = entry.frontMatter;
    const id = typeof values.id === "string" ? values.id : undefined;

    if (
      (entry.domain === "policy" || entry.domain === "decision") &&
      values.revisit === undefined
    ) {
      diagnostics.push(
        entryDiagnostic(
          entry,
          "validation.missing-revisit",
          "Decision and policy revisions must declare revisit.",
        ),
      );
    }

    if (entry.domain === "policy") {
      if (values.action === undefined || values.effect === undefined) {
        diagnostics.push(
          entryDiagnostic(
            entry,
            "invalid_entry",
            "Policy revisions must declare one action and one effect.",
          ),
        );
      }
      if (
        values.effect === "escalate" &&
        typeof values.route === "string" &&
        isRoot &&
        !ownershipRoutes.has(values.route)
      ) {
        diagnostics.push(
          entryDiagnostic(
            entry,
            "unresolvable_route",
            `Escalation route ${JSON.stringify(values.route)} does not resolve in the ownership domain.`,
          ),
        );
      }
    } else if (
      values.action !== undefined ||
      values.effect !== undefined ||
      values.route !== undefined
    ) {
      diagnostics.push(
        entryDiagnostic(
          entry,
          "invalid_entry",
          "Definition revisions must not declare action, effect, or route.",
        ),
      );
    }

    if (values.delegates !== undefined && entry.domain !== "ownership") {
      diagnostics.push({
        ...entryDiagnostic(
          entry,
          "validation.ignored-delegates",
          "Delegation applies only to ownership entries and was ignored.",
        ),
        severity: "warning",
      });
    }

    if (entry.domain !== "identity") {
      for (const field of BUNDLE_METADATA_KEYS) {
        if (values[field] === undefined) continue;
        diagnostics.push({
          ...entryDiagnostic(
            entry,
            "validation.ignored-bundle-metadata",
            `Bundle metadata field ${JSON.stringify(field)} outside the identity entry was ignored.`,
          ),
          severity: "warning",
          details: { field },
        });
      }
    }

    if (typeof values.revisit === "string" && !isCalendarDate(values.revisit)) {
      diagnostics.push(
        entryDiagnostic(
          entry,
          "validation.invalid-date",
          `Revisit date ${JSON.stringify(values.revisit)} is not an ISO 8601 calendar date.`,
        ),
      );
    }

    if (
      typeof values.source === "string" &&
      values.source.startsWith("synced:") &&
      isRecord(values.upstream)
    ) {
      const system = values.source.slice("synced:".length);
      if (values.upstream.system !== system) {
        diagnostics.push(
          entryDiagnostic(
            entry,
            "validation.invalid-upstream-system",
            "Synced source and upstream system must identify the same system.",
          ),
        );
      }
      if (
        typeof values.upstream.fetched === "string" &&
        !isCalendarDate(values.upstream.fetched)
      ) {
        diagnostics.push(
          entryDiagnostic(
            entry,
            "validation.invalid-date",
            `Fetched date ${JSON.stringify(values.upstream.fetched)} is not an ISO 8601 calendar date.`,
          ),
        );
      }
    }

    if (
      typeof values.owner === "string" &&
      (!values.owner.startsWith("role.") || !ID_PATTERN.test(values.owner))
    ) {
      diagnostics.push(
        entryDiagnostic(
          entry,
          "validation.invalid-owner",
          `Owner for ${JSON.stringify(id ?? "entry")} must name a role identifier.`,
        ),
      );
    }
  }
  return diagnostics;
}

export function validateBundleMetadata(
  bundle: Bundle,
  isRoot: boolean,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const identity = identityEntry(bundle);
  const values = identity?.frontMatter ?? bundle.identityMetadata;
  if (
    values.bundle !== undefined &&
    (typeof values.bundle !== "string" || values.bundle.length === 0)
  ) {
    diagnostics.push(
      metadataDiagnostic(
        identity,
        "invalid_entry",
        "bundle must be a non-empty string when present.",
      ),
    );
  }

  if (!isRoot) {
    for (const field of ROOT_ONLY_METADATA_KEYS) {
      if (values[field] === undefined) continue;
      diagnostics.push({
        code: "validation.ignored-root-metadata",
        severity: "warning",
        message: `Root-only metadata field ${JSON.stringify(field)} was ignored in a non-root bundle.`,
        ...(identity ? { path: identity.sourcePath, line: identity.line } : {}),
        details: { field },
      });
    }
    diagnostics.push(...validateLifecycle(values, identity, bundle.entries));
    return diagnostics;
  }

  diagnostics.push(...validateGraceDays(values, identity));
  diagnostics.push(...validateScopes(values, identity, bundle.entries));
  diagnostics.push(...validateLifecycle(values, identity, bundle.entries));

  const retired = retiredIds(bundle);
  const hasLastResort = bundle.entries.some(
    (entry) =>
      entry.domain === "ownership" &&
      entry.frontMatter.id === "own.last-resort" &&
      entry.frontMatter.status === "approved" &&
      !retired.has("own.last-resort"),
  );
  if (!hasLastResort) {
    diagnostics.push({
      code: "validation.missing-last-resort",
      severity: "error",
      message: "A root bundle must declare an approved own.last-resort entry.",
      path: "ownership.md",
      entryId: "own.last-resort",
    });
  }
  return diagnostics;
}

export function normalizeBundleMetadata(
  bundle: Bundle,
  isRoot: boolean,
): BundleMetadata {
  const values = identityEntry(bundle)?.frontMatter ?? bundle.identityMetadata;
  const lifecycle = normalizeLifecycle(values.lifecycle);
  return Object.freeze({
    ...(typeof values.bundle === "string" ? { bundle: values.bundle } : {}),
    ...(isRoot && isRecord(values.scopes)
      ? { scopes: normalizeScopes(values.scopes) }
      : {}),
    ...(isRoot && typeof values.grace_days === "number"
      ? { graceDays: values.grace_days }
      : {}),
    lifecycle: Object.freeze(lifecycle),
  });
}

function validateGraceDays(
  values: Readonly<Record<string, unknown>>,
  identity: ParsedEntryRevision | undefined,
): readonly Diagnostic[] {
  if (values.grace_days === undefined) return [];
  if (
    typeof values.grace_days === "number" &&
    Number.isInteger(values.grace_days) &&
    values.grace_days >= 0 &&
    values.grace_days <= 90
  ) {
    return [];
  }
  return [
    metadataDiagnostic(
      identity,
      "validation.invalid-grace-days",
      "grace_days must be an integer from 0 through 90.",
    ),
  ];
}

function validateScopes(
  values: Readonly<Record<string, unknown>>,
  identity: ParsedEntryRevision | undefined,
  entries: readonly ParsedEntryRevision[],
): readonly Diagnostic[] {
  if (values.scopes === undefined)
    return validateEntryScopes(entries, new Set());
  if (!isRecord(values.scopes)) {
    return [
      metadataDiagnostic(
        identity,
        "validation.invalid-scopes",
        "scopes must be a mapping of custom scope declarations.",
      ),
    ];
  }

  const diagnostics: Diagnostic[] = [];
  const declarations = new Set(Object.keys(values.scopes));
  const graph = new Map<string, readonly string[]>();
  for (const [label, declaration] of Object.entries(values.scopes)) {
    if (DEFAULT_SCOPES.has(label) || !isScopeDeclaration(declaration)) {
      diagnostics.push(
        metadataDiagnostic(
          identity,
          "validation.invalid-scopes",
          `Scope ${JSON.stringify(label)} is not a valid custom scope declaration.`,
        ),
      );
      continue;
    }
    graph.set(label, declaration.narrower_than);
    for (const target of declaration.narrower_than) {
      if (!DEFAULT_SCOPES.has(target) && !declarations.has(target)) {
        diagnostics.push(
          metadataDiagnostic(
            identity,
            "validation.unknown-scope-ref",
            `Scope ${JSON.stringify(label)} references undeclared scope ${JSON.stringify(target)}.`,
          ),
        );
      }
    }
  }
  if (hasCycle(graph)) {
    diagnostics.push(
      metadataDiagnostic(
        identity,
        "validation.scope-cycle",
        "The custom scope narrower_than graph contains a cycle.",
      ),
    );
  }
  diagnostics.push(...validateEntryScopes(entries, declarations));
  return diagnostics;
}

function validateEntryScopes(
  entries: readonly ParsedEntryRevision[],
  customScopes: ReadonlySet<string>,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const entry of entries) {
    const scope = entry.frontMatter.scope;
    if (
      typeof scope === "string" &&
      !DEFAULT_SCOPES.has(scope) &&
      !customScopes.has(scope)
    ) {
      diagnostics.push(
        entryDiagnostic(
          entry,
          "validation.unknown-scope",
          `Scope ${JSON.stringify(scope)} is not declared by the root bundle.`,
        ),
      );
    }
  }
  return diagnostics;
}

function validateLifecycle(
  values: Readonly<Record<string, unknown>>,
  identity: ParsedEntryRevision | undefined,
  entries: readonly ParsedEntryRevision[],
): readonly Diagnostic[] {
  if (values.lifecycle === undefined) return [];
  if (!isRecord(values.lifecycle)) {
    return [
      metadataDiagnostic(
        identity,
        "validation.invalid-lifecycle",
        "lifecycle must be a mapping keyed by entry id.",
      ),
    ];
  }

  const diagnostics: Diagnostic[] = [];
  const entriesById = new Map<string, readonly ParsedEntryRevision[]>();
  for (const entry of entries) {
    if (typeof entry.frontMatter.id !== "string") continue;
    const revisions = entriesById.get(entry.frontMatter.id) ?? [];
    entriesById.set(entry.frontMatter.id, [...revisions, entry]);
  }

  for (const [id, value] of Object.entries(values.lifecycle)) {
    const revisions = entriesById.get(id);
    if (!revisions) {
      diagnostics.push(
        metadataDiagnostic(
          identity,
          "validation.invalid-lifecycle-ref",
          `Lifecycle key ${JSON.stringify(id)} names no entry in this bundle.`,
          id,
        ),
      );
    }
    if (!isLifecycleRecord(value)) {
      diagnostics.push(
        metadataDiagnostic(
          identity,
          "validation.invalid-lifecycle",
          `Lifecycle record for ${JSON.stringify(id)} is malformed or lacks required attribution.`,
          id,
        ),
      );
      continue;
    }
    if (value.state === "contested" && revisions) {
      const effective = highestApproved(revisions);
      const source = effective?.frontMatter.source;
      if (typeof source === "string" && source.startsWith("synced:")) {
        diagnostics.push(
          metadataDiagnostic(
            identity,
            "validation.synced-contest",
            `Synced entry ${JSON.stringify(id)} must be contested in its system of record.`,
            id,
          ),
        );
      }
    }
  }
  return diagnostics;
}

function identityEntry(bundle: Bundle): ParsedEntryRevision | undefined {
  const identityId =
    typeof bundle.identityMetadata.id === "string"
      ? bundle.identityMetadata.id
      : undefined;
  const revisions = bundle.entries.filter(
    (entry) =>
      entry.domain === "identity" &&
      (identityId === undefined || entry.frontMatter.id === identityId),
  );
  return highestApproved(revisions) ?? revisions[0];
}

function highestApproved(
  revisions: readonly ParsedEntryRevision[],
): ParsedEntryRevision | undefined {
  let winner: ParsedEntryRevision | undefined;
  for (const revision of revisions) {
    if (
      revision.frontMatter.status !== "approved" ||
      typeof revision.frontMatter.rev !== "number"
    ) {
      continue;
    }
    if (
      winner === undefined ||
      revision.frontMatter.rev > (winner.frontMatter.rev as number)
    ) {
      winner = revision;
    }
  }
  return winner;
}

function resolvableOwnershipRoutes(
  entries: readonly ParsedEntryRevision[],
  retired: ReadonlySet<string>,
): ReadonlySet<string> {
  const routes = new Set<string>();
  for (const entry of entries) {
    if (
      entry.domain !== "ownership" ||
      entry.frontMatter.status !== "approved"
    ) {
      continue;
    }
    if (
      typeof entry.frontMatter.id === "string" &&
      !retired.has(entry.frontMatter.id)
    ) {
      routes.add(entry.frontMatter.id);
    } else if (typeof entry.frontMatter.id === "string") {
      continue;
    }
    if (typeof entry.frontMatter.owner === "string") {
      routes.add(entry.frontMatter.owner);
    }
  }
  return routes;
}

function retiredIds(bundle: Bundle): ReadonlySet<string> {
  const values = identityEntry(bundle)?.frontMatter ?? bundle.identityMetadata;
  if (!isRecord(values.lifecycle)) return new Set();
  return new Set(
    Object.entries(values.lifecycle).flatMap(([id, record]) =>
      isRecord(record) && record.state === "retired" ? [id] : [],
    ),
  );
}

function isLifecycleRecord(value: unknown): value is LifecycleRecord {
  if (!isRecord(value)) return false;
  if (value.state !== "contested" && value.state !== "retired") return false;
  if (
    typeof value.by !== "string" ||
    value.by.length === 0 ||
    typeof value.date !== "string" ||
    !isCalendarDate(value.date)
  ) {
    return false;
  }
  if (value.state === "contested") {
    return typeof value.ref === "string" && value.ref.length > 0;
  }
  return (
    value.ref === undefined ||
    (typeof value.ref === "string" && value.ref.length > 0)
  );
}

function isScopeDeclaration(
  value: unknown,
): value is { readonly narrower_than: readonly string[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.narrower_than) &&
    value.narrower_than.every(
      (target): target is string =>
        typeof target === "string" && target.length > 0,
    )
  );
}

function hasCycle(graph: ReadonlyMap<string, readonly string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(label: string): boolean {
    if (visiting.has(label)) return true;
    if (visited.has(label)) return false;
    visiting.add(label);
    for (const target of graph.get(label) ?? []) {
      if (graph.has(target) && visit(target)) return true;
    }
    visiting.delete(label);
    visited.add(label);
    return false;
  }

  return [...graph.keys()].some(visit);
}

function normalizeScopes(
  scopes: Readonly<Record<string, unknown>>,
): Readonly<Record<string, { readonly narrower_than: readonly string[] }>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(scopes).map(([label, declaration]) => {
        const narrowerThan = isScopeDeclaration(declaration)
          ? Object.freeze([...declaration.narrower_than])
          : Object.freeze([] as string[]);
        return [label, Object.freeze({ narrower_than: narrowerThan })];
      }),
    ),
  );
}

function normalizeLifecycle(
  lifecycle: unknown,
): Record<string, LifecycleRecord> {
  if (!isRecord(lifecycle)) return {};
  return Object.fromEntries(
    Object.entries(lifecycle).flatMap(([id, value]) =>
      isLifecycleRecord(value)
        ? [
            [
              id,
              Object.freeze({
                state: value.state,
                by: value.by,
                date: value.date,
                ...(typeof value.ref === "string" ? { ref: value.ref } : {}),
              }),
            ],
          ]
        : [],
    ),
  );
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function entryDiagnostic(
  entry: ParsedEntryRevision,
  code: string,
  message: string,
): Diagnostic {
  return {
    code,
    severity: "error",
    message,
    path: entry.sourcePath,
    line: entry.line,
    ...(typeof entry.frontMatter.id === "string"
      ? { entryId: entry.frontMatter.id }
      : {}),
  };
}

function metadataDiagnostic(
  identity: ParsedEntryRevision | undefined,
  code: string,
  message: string,
  entryId?: string,
): Diagnostic {
  const affectedEntryId =
    entryId ??
    (typeof identity?.frontMatter.id === "string"
      ? identity.frontMatter.id
      : undefined);
  return {
    code,
    severity: "error",
    message,
    ...(identity ? { path: identity.sourcePath, line: identity.line } : {}),
    ...(affectedEntryId !== undefined ? { entryId: affectedEntryId } : {}),
  };
}
