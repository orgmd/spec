import { compareUtf8Bytes } from "../diagnostics/sort.js";
import { isCalendarDate } from "../validation/calendar-date.js";
import { identifierCanonicalJson, IdentifierError } from "./canonical.js";
import { sha256Hex } from "./content-id.js";

export interface ContextIdInput {
  readonly as_of: string;
  readonly bundles: readonly {
    readonly bundle_id: string;
    readonly content_id: string;
    readonly node_path: string;
  }[];
  readonly clearance: readonly string[];
  readonly bundle_failures?: readonly {
    readonly bundle_index: number;
    readonly code: BundleFailureCode;
    readonly detail: string;
  }[];
  readonly disclosure_mode: "A";
  readonly spec_version: "0.3.1";
}

export type BundleFailureCode = "unparseable_bundle" | "integrity_failure";

export interface BundleFailure {
  readonly bundleIndex: number;
  readonly code: BundleFailureCode;
  readonly detail: string;
}

export interface BundleVersion {
  readonly bundleId: string;
  readonly path: string;
  readonly contentId: string;
}

export function computeContextId(
  bundles: readonly BundleVersion[],
  clearance: readonly string[],
  asOf: string,
  bundleFailures: readonly BundleFailure[] = [],
): string {
  if (!isCalendarDate(asOf)) {
    throw new IdentifierError({
      code: "identifier.invalid-as-of",
      severity: "error",
      message: "Context identifier as_of must be an ISO 8601 calendar date.",
      details: { as_of: asOf },
    });
  }
  const failures = [...bundleFailures].sort(
    (left, right) =>
      left.bundleIndex - right.bundleIndex ||
      compareUtf8Bytes(left.code, right.code) ||
      compareUtf8Bytes(left.detail, right.detail),
  );
  const input: ContextIdInput = {
    as_of: asOf,
    bundles: bundles.map(({ bundleId, contentId, path }) => ({
      bundle_id: bundleId,
      content_id: contentId,
      node_path: path,
    })),
    clearance: [...new Set(clearance)].sort(compareUtf8Bytes),
    ...(failures.length === 0
      ? {}
      : {
          bundle_failures: failures.map(({ bundleIndex, code, detail }) => ({
            bundle_index: bundleIndex,
            code,
            detail,
          })),
        }),
    disclosure_mode: "A",
    spec_version: "0.3.1",
  };
  return `sha256:${sha256Hex(identifierCanonicalJson(input))}`;
}
