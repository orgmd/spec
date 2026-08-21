import { compareUtf8Bytes } from "../diagnostics/sort.js";
import { identifierCanonicalJson } from "./canonical.js";
import { sha256Hex } from "./content-id.js";

export interface ContextIdInput {
  readonly bundles: readonly {
    readonly bundle_id: string;
    readonly content_id: string;
    readonly node_path: string;
  }[];
  readonly clearance: readonly string[];
  readonly disclosure_mode: "A";
  readonly spec_version: "0.3.1";
}

export interface BundleVersion {
  readonly bundleId: string;
  readonly path: string;
  readonly contentId: string;
}

export function computeContextId(
  bundles: readonly BundleVersion[],
  clearance: readonly string[],
): string {
  const input: ContextIdInput = {
    bundles: bundles.map(({ bundleId, contentId, path }) => ({
      bundle_id: bundleId,
      content_id: contentId,
      node_path: path,
    })),
    clearance: [...new Set(clearance)].sort(compareUtf8Bytes),
    disclosure_mode: "A",
    spec_version: "0.3.1",
  };
  return `sha256:${sha256Hex(identifierCanonicalJson(input))}`;
}
