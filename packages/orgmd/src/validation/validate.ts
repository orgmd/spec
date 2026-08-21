import { loadBundle } from "../bundle/load.js";
import { sortDiagnostics } from "../diagnostics/sort.js";
import type { OperationResult } from "../diagnostics/types.js";
import type {
  Bundle,
  EntryRevision,
  ParsedEntryRevision,
  ValidatedBundle,
} from "../model/types.js";
import {
  normalizeBundleMetadata,
  validateBundleMetadata,
  validateDomainRules,
  validateRevisionSchemas,
  validateRevisionSets,
} from "./semantic.js";

const KNOWN_ENTRY_KEYS = new Set([
  "id",
  "owner",
  "scope",
  "status",
  "source",
  "rev",
  "revisit",
  "ref",
  "upstream",
  "action",
  "effect",
  "route",
  "delegates",
  "bundle",
  "scopes",
  "grace_days",
  "lifecycle",
]);

export interface ValidateBundleOptions {
  readonly isRoot: boolean;
}

export function validateBundle(
  bundle: Bundle,
  options: ValidateBundleOptions,
): OperationResult<ValidatedBundle> {
  const diagnostics = sortDiagnostics([
    ...validateRevisionSchemas(bundle),
    ...validateRevisionSets(bundle),
    ...validateBundleMetadata(bundle, options.isRoot),
    ...validateDomainRules(bundle, options.isRoot),
  ]);
  if (diagnostics.some(({ severity }) => severity === "error")) {
    return { diagnostics };
  }

  return {
    value: brandValidated(bundle, options.isRoot),
    diagnostics,
  };
}

export async function validateBundlePath(
  reference: string,
  options: ValidateBundleOptions,
): Promise<OperationResult<ValidatedBundle>> {
  const loaded = await loadBundle({ reference, isRoot: options.isRoot });
  if (!loaded.value) return { diagnostics: loaded.diagnostics };

  const validated = validateBundle(loaded.value, options);
  const diagnostics = sortDiagnostics([
    ...loaded.diagnostics,
    ...validated.diagnostics,
  ]);
  return validated.value
    ? { value: validated.value, diagnostics }
    : { diagnostics };
}

function brandValidated(bundle: Bundle, isRoot: boolean): ValidatedBundle {
  const entries = Object.freeze(bundle.entries.map(normalizeEntry));
  return Object.freeze({
    reference: bundle.reference,
    path: bundle.path,
    ...(bundle.nodePath === undefined ? {} : { nodePath: bundle.nodePath }),
    isRoot,
    metadata: normalizeBundleMetadata(bundle, isRoot),
    entries,
  }) as unknown as ValidatedBundle;
}

function normalizeEntry(entry: ParsedEntryRevision): EntryRevision {
  const values = entry.frontMatter;
  const upstream = isRecord(values.upstream)
    ? Object.freeze({ ...values.upstream })
    : undefined;
  const delegates = Array.isArray(values.delegates)
    ? Object.freeze(
        values.delegates.filter(
          (value): value is string => typeof value === "string",
        ),
      )
    : undefined;
  const extra = Object.freeze(
    Object.fromEntries(
      Object.entries(values).filter(([key]) => !KNOWN_ENTRY_KEYS.has(key)),
    ),
  );

  return Object.freeze({
    id: values.id as string,
    owner: values.owner as string,
    scope: values.scope as string,
    status: values.status as EntryRevision["status"],
    source: values.source as string,
    rev: values.rev as number,
    domain: entry.domain,
    body: entry.body,
    sourcePath: entry.sourcePath,
    line: entry.line,
    ...(typeof values.revisit === "string" ? { revisit: values.revisit } : {}),
    ...(typeof values.ref === "string" ? { ref: values.ref } : {}),
    ...(upstream ? { upstream } : {}),
    ...(typeof values.action === "string" ? { action: values.action } : {}),
    ...(values.effect === "allow" ||
    values.effect === "escalate" ||
    values.effect === "deny"
      ? { effect: values.effect }
      : {}),
    ...(typeof values.route === "string" ? { route: values.route } : {}),
    ...(delegates ? { delegates } : {}),
    extra,
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
