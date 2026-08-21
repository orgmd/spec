import canonicalize from "canonicalize";
import { compareUtf8Bytes } from "../diagnostics/sort.js";
import type { Diagnostic } from "../diagnostics/types.js";
import type { BundleMetadata, EntryRevision } from "../model/types.js";

export type EntryCanonicalForm = Readonly<Record<string, unknown>>;
export type BundleMetadataCanonicalForm = Readonly<Record<string, unknown>>;

export class IdentifierError extends Error {
  readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.name = "IdentifierError";
    this.diagnostic = Object.freeze({ ...diagnostic });
  }
}

export function normalizeBody(body: string): string {
  const lines = body
    .normalize("NFC")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/u, ""));

  while (lines[0] === "") lines.shift();
  while (lines.at(-1) === "") lines.pop();
  return lines.join("\n");
}

export function entryCanonicalForm(
  revision: EntryRevision,
): EntryCanonicalForm {
  const upstream = revision.upstream
    ? {
        system: revision.upstream.system,
        ref: revision.upstream.ref,
        fetched: revision.upstream.fetched,
        digest: revision.upstream.digest,
      }
    : undefined;

  return Object.freeze({
    id: revision.id,
    owner: revision.owner,
    scope: revision.scope,
    status: revision.status,
    source: revision.source,
    domain: revision.domain,
    rev: revision.rev,
    ...(revision.revisit !== undefined ? { revisit: revision.revisit } : {}),
    ...(revision.ref !== undefined ? { ref: revision.ref } : {}),
    ...(upstream !== undefined ? { upstream } : {}),
    ...(revision.action !== undefined ? { action: revision.action } : {}),
    ...(revision.effect !== undefined ? { effect: revision.effect } : {}),
    ...(revision.route !== undefined ? { route: revision.route } : {}),
    ...(revision.delegates !== undefined
      ? { delegates: [...revision.delegates] }
      : {}),
    body: normalizeBody(revision.body),
  });
}

export function bundleMetadataCanonicalForm(
  metadata: BundleMetadata,
): BundleMetadataCanonicalForm {
  const scopes = metadata.scopes
    ? Object.fromEntries(
        Object.entries(metadata.scopes)
          .sort(([left], [right]) => compareUtf8Bytes(left, right))
          .map(([label, declaration]) => [
            label,
            [...new Set(declaration.narrower_than)].sort(compareUtf8Bytes),
          ]),
      )
    : undefined;
  const lifecycle = Object.entries(metadata.lifecycle)
    .sort(([left], [right]) => compareUtf8Bytes(left, right))
    .map(([id, record]) => ({ id, state: record.state }));

  return Object.freeze({
    ...(metadata.bundle !== undefined ? { bundle: metadata.bundle } : {}),
    ...(scopes !== undefined ? { scopes } : {}),
    ...(metadata.graceDays !== undefined
      ? { grace_days: metadata.graceDays }
      : {}),
    ...(lifecycle.length > 0 ? { lifecycle } : {}),
  });
}

export function identifierCanonicalJson(
  value: unknown,
  context: Pick<Diagnostic, "path" | "line" | "entryId" | "details"> = {},
): string {
  try {
    const serialized = canonicalize(value);
    if (serialized === undefined) throw new Error("unsupported root value");
    return serialized;
  } catch {
    throw new IdentifierError({
      code: "identifier.canonicalization-failed",
      severity: "error",
      message: "Identifier input could not be canonicalized with RFC 8785 JCS.",
      ...context,
    });
  }
}
