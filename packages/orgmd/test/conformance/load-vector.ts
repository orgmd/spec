import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Bundle,
  BundleFailure,
  Diagnostic,
  EntryRevision,
  ParsedEntryRevision,
  ResolutionError,
  ValidatedBundle,
  WithheldMarker,
} from "../../src/index.js";
import {
  bundleMetadataCanonicalForm,
  compileContext,
  computeContentId,
  computeContextId,
  metadataDigest,
  parseContentFile,
  resolveContext,
  serializeEffectiveContext,
  validateBundle,
} from "../../src/index.js";

type Operation =
  | "parse"
  | "validate"
  | "content-id"
  | "context-id"
  | "resolve"
  | "compile-agents-md"
  | "compile-prompt";

interface ConformanceManifest {
  readonly suite: "orgmd-core";
  readonly version: "0.1.0";
  readonly spec_version: "0.3.1";
  readonly operations: readonly Operation[];
}

export interface ConformanceVector {
  readonly name: string;
  readonly operation: Operation;
  readonly input: Readonly<Record<string, unknown>>;
  readonly expected: unknown;
}

const casesDirectory = fileURLToPath(
  new URL("../../../../conformance/core-v0.1/cases/", import.meta.url),
);
const manifestPath = fileURLToPath(
  new URL("../../../../conformance/core-v0.1/manifest.json", import.meta.url),
);

export function loadManifest(): ConformanceManifest {
  const value: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  const manifest = record(value, "manifest");
  if (
    manifest.suite !== "orgmd-core" ||
    manifest.version !== "0.1.0" ||
    manifest.spec_version !== "0.3.1" ||
    !Array.isArray(manifest.operations) ||
    !manifest.operations.every(
      (operation) =>
        typeof operation === "string" &&
        [
          "parse",
          "validate",
          "content-id",
          "context-id",
          "resolve",
          "compile-agents-md",
          "compile-prompt",
        ].includes(operation),
    )
  ) {
    throw new Error("invalid conformance manifest");
  }
  return manifest as unknown as ConformanceManifest;
}

export function loadVectors(): readonly ConformanceVector[] {
  return loadVectorsFrom(casesDirectory);
}

export function loadVectorsFrom(
  directory: string,
): readonly ConformanceVector[] {
  const root = lstatSync(directory);
  if (root.isSymbolicLink()) {
    throw new Error("conformance corpus must not contain symlinks");
  }
  if (!root.isDirectory()) {
    throw new Error("conformance corpus root must be a directory");
  }
  const files = walkJson(directory);
  const vectors = files.flatMap((path) => {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? parsed : [parsed];
  });
  vectors.forEach(assertVector);
  const names = new Set<string>();
  for (const vector of vectors) {
    if (names.has(vector.name))
      throw new Error(`duplicate vector name: ${vector.name}`);
    names.add(vector.name);
  }
  return Object.freeze(vectors);
}

export async function executeVector(
  vector: ConformanceVector,
): Promise<unknown> {
  switch (vector.operation) {
    case "parse":
      return executeParse(vector.input);
    case "validate":
      return executeValidate(vector.input);
    case "content-id":
      return executeContentId(vector.input);
    case "context-id":
      return executeContextId(vector.input);
    case "resolve":
      return executeResolve(vector.input);
    case "compile-agents-md":
      return executeCompile(vector.input, "agents-md");
    case "compile-prompt":
      return executeCompile(vector.input, "prompt");
  }
}

function executeParse(input: Readonly<Record<string, unknown>>): unknown {
  const result = parseContentFile({
    path: stringField(input, "path"),
    domain: stringField(input, "domain"),
    bytes: new TextEncoder().encode(stringField(input, "text")),
  });
  return {
    ...(result.value
      ? {
          entries: result.value.map((entry) => ({
            front_matter: entry.frontMatter,
            body: entry.body,
            domain: entry.domain,
            source_path: entry.sourcePath,
            line: entry.line,
          })),
        }
      : {}),
    diagnostics: result.diagnostics.map(stableDiagnostic),
  };
}

function executeValidate(input: Readonly<Record<string, unknown>>): unknown {
  const bundle = parsedBundle(recordField(input, "bundle"));
  const result = validateBundle(bundle, {
    isRoot: bundle.isRoot,
    ...(bundle.nodePath === undefined ? {} : { nodePath: bundle.nodePath }),
  });
  return {
    valid: result.value !== undefined,
    diagnostics: result.diagnostics.map(stableDiagnostic),
  };
}

function executeContentId(input: Readonly<Record<string, unknown>>): unknown {
  const bundle = parsedBundle(recordField(input, "bundle"));
  const validated = validateBundle(bundle, {
    isRoot: bundle.isRoot,
    ...(bundle.nodePath === undefined ? {} : { nodePath: bundle.nodePath }),
  });
  if (!validated.value) {
    return { diagnostics: validated.diagnostics.map(stableDiagnostic) };
  }
  return {
    metadata_digest: metadataDigest(
      bundleMetadataCanonicalForm(validated.value.metadata),
    ),
    content_id: computeContentId(validated.value),
    diagnostics: validated.diagnostics.map(stableDiagnostic),
  };
}

function executeContextId(input: Readonly<Record<string, unknown>>): unknown {
  const bundles = arrayField(input, "bundles").map((value) => {
    const bundle = record(value, "context-id bundle");
    return {
      bundleId: stringField(bundle, "bundle_id"),
      contentId: stringField(bundle, "content_id"),
      path: stringField(bundle, "node_path"),
    };
  });
  return {
    context_id: computeContextId(
      bundles,
      arrayField(input, "clearance").map((value) => string(value, "clearance")),
      stringField(input, "as_of"),
      vectorBundleFailures(input),
    ),
  };
}

function executeResolve(input: Readonly<Record<string, unknown>>): unknown {
  const path = arrayField(input, "path").map(normalizedBundle);
  const result = resolveContext({
    path,
    clearance: arrayField(input, "clearance").map((value) =>
      string(value, "clearance"),
    ),
    today: stringField(input, "today"),
    ...(typeof input.anonymous === "boolean"
      ? { anonymous: input.anonymous }
      : {}),
    ...(input.bundle_failures === undefined
      ? {}
      : { bundleFailures: vectorBundleFailures(input) }),
  });
  if (!result.value) {
    return { diagnostics: result.diagnostics.map(stableDiagnostic) };
  }
  const visibleEntryIds = result.value.entries.flatMap((entry) =>
    isWithheld(entry) ? [] : [entry.revision.id],
  );
  const visibleEntries = result.value.entries.flatMap((entry) =>
    isWithheld(entry)
      ? []
      : [
          {
            id: entry.revision.id,
            rev: entry.revision.rev,
            bundle_index: entry.bundleIndex,
            contested: entry.contested,
            stale_reasons: entry.staleReasons,
          },
        ],
  );
  const withheld = result.value.entries.filter(isWithheld);
  return {
    canonical_effective_context: serializeEffectiveContext(result.value),
    context_id: result.value.contextId,
    visible_entry_ids: visibleEntryIds,
    visible_entries: visibleEntries,
    withheld,
    resolution_errors: result.value.resolutionErrors.map(stableResolutionError),
    diagnostics: result.value.diagnostics.map(stableDiagnostic),
  };
}

function executeCompile(
  input: Readonly<Record<string, unknown>>,
  target: "agents-md" | "prompt",
): unknown {
  const result = resolveContext({
    path: arrayField(input, "path").map(normalizedBundle),
    clearance: arrayField(input, "clearance").map((value) =>
      string(value, "clearance"),
    ),
    today: stringField(input, "today"),
    ...(typeof input.anonymous === "boolean"
      ? { anonymous: input.anonymous }
      : {}),
    ...(input.bundle_failures === undefined
      ? {}
      : { bundleFailures: vectorBundleFailures(input) }),
  });
  if (!result.value) {
    return { diagnostics: result.diagnostics.map(stableDiagnostic) };
  }
  const compiled = compileContext(result.value, target);
  return (
    compiled.value ?? {
      diagnostics: compiled.diagnostics.map(stableDiagnostic),
    }
  );
}

function vectorBundleFailures(
  input: Readonly<Record<string, unknown>>,
): readonly BundleFailure[] {
  if (input.bundle_failures === undefined) return [];
  return arrayField(input, "bundle_failures").map((value) => {
    const failure = record(value, "bundle failure");
    const code = stringField(failure, "code");
    if (code !== "unparseable_bundle" && code !== "integrity_failure") {
      throw new Error("bundle failure code is invalid");
    }
    return {
      bundleIndex: numberField(failure, "bundle_index"),
      code,
      detail: stringField(failure, "detail"),
    };
  });
}

function parsedBundle(value: Readonly<Record<string, unknown>>): Bundle {
  const entries = arrayField(value, "entries").map(parsedEntry);
  return {
    reference: stringField(value, "reference"),
    path: stringField(value, "path"),
    ...(typeof value.node_path === "string"
      ? { nodePath: value.node_path }
      : {}),
    isRoot: booleanField(value, "is_root"),
    identityMetadata: recordField(value, "identity_metadata"),
    entries,
  };
}

function parsedEntry(value: unknown): ParsedEntryRevision {
  const entry = record(value, "parsed entry");
  return {
    frontMatter: recordField(entry, "front_matter"),
    body: stringField(entry, "body"),
    domain: stringField(entry, "domain"),
    sourcePath: stringField(entry, "source_path"),
    line: numberField(entry, "line"),
  };
}

function normalizedBundle(value: unknown): ValidatedBundle {
  const bundle = record(value, "resolved bundle");
  const metadata = recordField(bundle, "metadata");
  return {
    reference: stringField(bundle, "reference"),
    path: stringField(bundle, "path"),
    ...(typeof bundle.node_path === "string"
      ? { nodePath: bundle.node_path }
      : {}),
    isRoot: booleanField(bundle, "is_root"),
    metadata: {
      ...(typeof metadata.bundle === "string"
        ? { bundle: metadata.bundle }
        : {}),
      ...(metadata.scopes === undefined
        ? {}
        : { scopes: metadata.scopes as ValidatedBundle["metadata"]["scopes"] }),
      ...(typeof metadata.grace_days === "number"
        ? { graceDays: metadata.grace_days }
        : {}),
      lifecycle: recordField(
        metadata,
        "lifecycle",
      ) as ValidatedBundle["metadata"]["lifecycle"],
    },
    entries: arrayField(bundle, "entries").map(normalizedEntry),
  } as unknown as ValidatedBundle;
}

function normalizedEntry(value: unknown): EntryRevision {
  const entry = record(value, "resolved entry");
  return {
    id: stringField(entry, "id"),
    owner: stringField(entry, "owner"),
    scope: stringField(entry, "scope"),
    status: stringField(entry, "status") as EntryRevision["status"],
    source: stringField(entry, "source"),
    rev: numberField(entry, "rev"),
    domain: stringField(entry, "domain"),
    body: stringField(entry, "body"),
    sourcePath: stringField(entry, "source_path"),
    line: numberField(entry, "line"),
    ...(typeof entry.revisit === "string" ? { revisit: entry.revisit } : {}),
    ...(typeof entry.ref === "string" ? { ref: entry.ref } : {}),
    ...(entry.upstream === undefined
      ? {}
      : { upstream: record(entry.upstream, "upstream") }),
    ...(typeof entry.action === "string" ? { action: entry.action } : {}),
    ...(typeof entry.effect === "string"
      ? { effect: entry.effect as EntryRevision["effect"] }
      : {}),
    ...(typeof entry.route === "string" ? { route: entry.route } : {}),
    ...(Array.isArray(entry.delegates)
      ? { delegates: entry.delegates.map((item) => string(item, "delegate")) }
      : {}),
    extra: entry.extra === undefined ? {} : record(entry.extra, "extra"),
  };
}

function stableDiagnostic(
  diagnostic: Diagnostic,
): Readonly<Record<string, unknown>> {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
    ...(diagnostic.line === undefined ? {} : { line: diagnostic.line }),
    ...(diagnostic.column === undefined ? {} : { column: diagnostic.column }),
    ...(diagnostic.entryId === undefined
      ? {}
      : { entry_id: diagnostic.entryId }),
  };
}

function stableResolutionError(
  error: ResolutionError,
): Readonly<Record<string, unknown>> {
  return {
    code: error.code,
    node: error.node,
    ...(error.id === undefined ? {} : { id: error.id }),
    ...(error.id_withheld === undefined
      ? {}
      : { id_withheld: error.id_withheld }),
    detail: error.detail,
    ...(error.conflicts === undefined ? {} : { conflicts: error.conflicts }),
  };
}

function isWithheld(
  value: EntryRevision | WithheldMarker | { readonly revision: EntryRevision },
): value is WithheldMarker {
  return "withheld" in value;
}

function walkJson(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) {
        throw new Error("conformance corpus must not contain symlinks");
      }
      if (stats.isDirectory()) return walkJson(path);
      if (!entry.name.endsWith(".json")) return [];
      if (!stats.isFile()) {
        throw new Error("conformance JSON cases must be regular files");
      }
      return [path];
    })
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left), Buffer.from(right)),
    );
}

function assertVector(value: unknown): asserts value is ConformanceVector {
  const vector = record(value, "vector");
  if (
    typeof vector.name !== "string" ||
    ![
      "parse",
      "validate",
      "content-id",
      "context-id",
      "resolve",
      "compile-agents-md",
      "compile-prompt",
    ].includes(String(vector.operation)) ||
    !isRecord(vector.input) ||
    !("expected" in vector)
  ) {
    throw new Error("invalid conformance vector");
  }
}

function record(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function recordField(value: Readonly<Record<string, unknown>>, key: string) {
  return record(value[key], key);
}

function arrayField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): readonly unknown[] {
  const field = value[key];
  if (!Array.isArray(field)) throw new Error(`${key} must be an array`);
  return field;
}

function stringField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string {
  return string(value[key], key);
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function numberField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): number {
  const field = value[key];
  if (typeof field !== "number") throw new Error(`${key} must be a number`);
  return field;
}

function booleanField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  const field = value[key];
  if (typeof field !== "boolean") throw new Error(`${key} must be a boolean`);
  return field;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
