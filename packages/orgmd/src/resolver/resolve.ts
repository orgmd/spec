import { compareUtf8Bytes, sortDiagnostics } from "../diagnostics/sort.js";
import type { Diagnostic } from "../diagnostics/types.js";
import { IdentifierError } from "../identifiers/canonical.js";
import { computeContentId } from "../identifiers/content-id.js";
import {
  computeContextId,
  type BundleVersion,
} from "../identifiers/context-id.js";
import { resolveOrdinaryDefinitions } from "./definitions.js";
import { selectEffectiveRevisions } from "./revisions.js";
import { createScopeLattice } from "./scopes.js";
import type {
  ResolutionError,
  ResolvedEntry,
  ResolveRequest,
  ResolveResult,
  WithheldMarker,
} from "./types.js";

const WITHHELD_MARKER: WithheldMarker = Object.freeze({
  withheld: true,
  reason: "clearance",
});

export function resolveContext(request: ResolveRequest): ResolveResult {
  const clearance = normalizedClearance(request);
  if (!clearance) {
    return failure({
      code: "resolution.empty-clearance",
      severity: "error",
      message:
        "Clearance must contain at least one scope unless anonymous resolution is explicit.",
    });
  }

  const latticeResult = createScopeLattice(request.path[0]?.metadata.scopes);
  if (!latticeResult.value) return { diagnostics: latticeResult.diagnostics };

  let bundles: readonly BundleVersion[];
  let contextId: string;
  try {
    bundles = Object.freeze(
      request.path.map((bundle) =>
        Object.freeze({
          bundleId: bundle.metadata.bundle ?? bundle.reference,
          path: bundle.path,
          contentId: computeContentId(bundle),
        }),
      ),
    );
    contextId = computeContextId(bundles, clearance);
  } catch (error) {
    if (error instanceof IdentifierError) return failure(error.diagnostic);
    return failure({
      code: "resolution.identifier-failed",
      severity: "error",
      message: "Bundle identifiers could not be computed safely.",
    });
  }

  const selections = request.path.flatMap((bundle, bundleIndex) =>
    selectEffectiveRevisions(bundle, bundleIndex),
  );
  const definitions = resolveOrdinaryDefinitions(
    selections,
    request.path,
    latticeResult.value,
    request.today,
  );
  const visible: ResolvedEntry[] = [];
  let withheldCount = 0;
  for (const entry of definitions.entries) {
    if (latticeResult.value.visible(entry.revision.scope, clearance)) {
      visible.push(entry);
    } else {
      withheldCount += 1;
    }
  }
  visible.sort((left, right) =>
    compareUtf8Bytes(left.revision.id, right.revision.id),
  );
  const entries = Object.freeze([
    ...visible,
    ...Array.from({ length: withheldCount }, () => WITHHELD_MARKER),
  ]);
  const resolutionErrors = sortResolutionErrors(definitions.resolutionErrors);
  const diagnostics = Object.freeze([]) as readonly Diagnostic[];
  const value = Object.freeze({
    entries,
    bundles,
    contextId,
    resolutionErrors,
    diagnostics,
  });
  return { value, diagnostics };
}

function normalizedClearance(
  request: ResolveRequest,
): readonly string[] | undefined {
  if (request.clearance.length === 0) {
    return request.anonymous ? Object.freeze(["public"]) : undefined;
  }
  return Object.freeze([...new Set(request.clearance)].sort(compareUtf8Bytes));
}

function sortResolutionErrors(
  errors: readonly ResolutionError[],
): readonly ResolutionError[] {
  return Object.freeze(
    [...errors].sort(
      (left, right) =>
        compareUtf8Bytes(left.node, right.node) ||
        compareUtf8Bytes(left.id ?? "", right.id ?? "") ||
        compareUtf8Bytes(left.code, right.code),
    ),
  );
}

function failure(...diagnostics: readonly Diagnostic[]): ResolveResult {
  return { diagnostics: sortDiagnostics(diagnostics) };
}
