import { compareUtf8Bytes, sortDiagnostics } from "../diagnostics/sort.js";
import type { Diagnostic } from "../diagnostics/types.js";
import { IdentifierError } from "../identifiers/canonical.js";
import { computeContentId } from "../identifiers/content-id.js";
import {
  computeContextId,
  type BundleVersion,
} from "../identifiers/context-id.js";
import { resolveAuthorityDefinitions } from "./authority.js";
import { resolveOrdinaryDefinitions } from "./definitions.js";
import {
  blockedEntryIds,
  entrySemanticErrors,
  renderResolutionDiagnostics,
  renderResolutionErrors,
  validateResolutionPath,
} from "./errors.js";
import { logicalNodePath } from "./nodes.js";
import { resolvePolicies } from "./policies.js";
import { selectEffectiveRevisions } from "./revisions.js";
import { createScopeLattice } from "./scopes.js";
import type {
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
  const pathDiagnostics = validateResolutionPath(request.path);
  if (pathDiagnostics.length > 0) return { diagnostics: pathDiagnostics };

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
          path: logicalNodePath(bundle),
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
  const semanticErrors = entrySemanticErrors(
    selections,
    request.path,
    latticeResult.value,
  );
  const initiallyBlocked = blockedEntryIds(semanticErrors);
  const eligible = selections.filter(
    (selection) => !initiallyBlocked.has(selection.id),
  );
  const authority = resolveAuthorityDefinitions(
    eligible,
    request.path,
    latticeResult.value,
    request.today,
  );
  const ownershipRoutes = new Set<string>();
  for (const entry of authority.entries) {
    if (entry.revision.domain !== "ownership") continue;
    ownershipRoutes.add(entry.revision.id);
    ownershipRoutes.add(entry.revision.owner);
  }
  const definitions = resolveOrdinaryDefinitions(
    eligible,
    request.path,
    latticeResult.value,
    request.today,
  );
  const policies = resolvePolicies(
    eligible,
    request.path,
    latticeResult.value,
    ownershipRoutes,
    request.today,
  );
  const allErrors = [
    ...semanticErrors,
    ...authority.resolutionErrors,
    ...definitions.resolutionErrors,
    ...policies.resolutionErrors,
  ];
  const blocked = blockedEntryIds(allErrors);
  const visible: ResolvedEntry[] = [];
  let withheldCount = 0;
  const resolved = [
    ...definitions.entries,
    ...authority.entries,
    ...policies.entries,
  ].filter((entry) => !blocked.has(entry.revision.id));
  for (const entry of resolved) {
    if (latticeResult.value.visible(entry.revision.scope, clearance)) {
      visible.push(entry);
    } else {
      withheldCount += 1;
    }
  }
  visible.sort(
    (left, right) =>
      compareUtf8Bytes(left.revision.id, right.revision.id) ||
      left.bundleIndex - right.bundleIndex,
  );
  const entries = Object.freeze([
    ...visible,
    ...Array.from({ length: withheldCount }, () => WITHHELD_MARKER),
  ]);
  const resolutionErrors = renderResolutionErrors(
    allErrors,
    selections,
    request.path,
    latticeResult.value,
    clearance,
  );
  const diagnostics = renderResolutionDiagnostics(
    authority.diagnostics,
    selections,
    request.path,
    latticeResult.value,
    clearance,
  );
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

function failure(...diagnostics: readonly Diagnostic[]): ResolveResult {
  return { diagnostics: sortDiagnostics(diagnostics) };
}
