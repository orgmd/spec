import { createHash } from "node:crypto";
import { compareUtf8Bytes } from "../diagnostics/sort.js";
import type { EntryRevision, ValidatedBundle } from "../model/types.js";
import {
  bundleMetadataCanonicalForm,
  entryCanonicalForm,
  identifierCanonicalJson,
  IdentifierError,
  type BundleMetadataCanonicalForm,
} from "./canonical.js";

export { IdentifierError } from "./canonical.js";

export function sha256Hex(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function metadataDigest(metadata: BundleMetadataCanonicalForm): string {
  return sha256Hex(identifierCanonicalJson(metadata));
}

export function computeBundleDigestInput(
  entries: readonly EntryRevision[],
  metadata: BundleMetadataCanonicalForm,
): string {
  const lines = ["!bundle-metadata", metadataDigest(metadata)];
  const revisions = [...entries].sort(
    (left, right) =>
      compareUtf8Bytes(left.id, right.id) || left.rev - right.rev,
  );
  let previous: EntryRevision | undefined;

  for (const revision of revisions) {
    if (previous?.id === revision.id && previous.rev === revision.rev) {
      throw new IdentifierError({
        code: "identifier.duplicate-revision",
        severity: "error",
        message: `Entry ${JSON.stringify(revision.id)} repeats revision ${String(revision.rev)}.`,
        path: revision.sourcePath,
        line: revision.line,
        entryId: revision.id,
        details: { rev: revision.rev },
      });
    }
    const serialized = identifierCanonicalJson(entryCanonicalForm(revision), {
      path: revision.sourcePath,
      line: revision.line,
      entryId: revision.id,
    });
    lines.push(revision.id, sha256Hex(serialized));
    previous = revision;
  }

  return `sha256:${sha256Hex(`${lines.join("\n")}\n`)}`;
}

export function computeContentId(bundle: ValidatedBundle): string {
  return computeBundleDigestInput(
    bundle.entries,
    bundleMetadataCanonicalForm(bundle.metadata),
  );
}
