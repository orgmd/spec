import { compareUtf8Bytes } from "../diagnostics/sort.js";
import type { Diagnostic } from "../diagnostics/types.js";
import { identifierCanonicalJson } from "../identifiers/canonical.js";
import type { EntryRevision, ValidatedBundle } from "../model/types.js";
import { isAtOrBelow, logicalNodePath } from "./nodes.js";
import type { RevisionSelection } from "./revisions.js";
import type { ScopeLattice } from "./scopes.js";
import type { ResolutionError, ResolvedEntry } from "./types.js";

export interface AuthorityResolution {
  readonly entries: readonly ResolvedEntry[];
  readonly resolutionErrors: readonly ResolutionError[];
  readonly diagnostics: readonly Diagnostic[];
}

export function isAuthorityDefinition(selection: RevisionSelection): boolean {
  return (
    selection.revision?.domain === "ownership" ||
    selection.revision?.domain === "decision"
  );
}

export function resolveAuthorityDefinitions(
  selections: readonly RevisionSelection[],
  path: readonly ValidatedBundle[],
  lattice: ScopeLattice,
  today: string,
): AuthorityResolution {
  const byId = new Map<string, RevisionSelection[]>();
  for (const selection of selections) {
    if (!selection.revision || !isAuthorityDefinition(selection)) continue;
    const candidates = byId.get(selection.id) ?? [];
    candidates.push(selection);
    byId.set(selection.id, candidates);
  }

  const entries: ResolvedEntry[] = [];
  const resolutionErrors: ResolutionError[] = [];
  const diagnostics: Diagnostic[] = [];
  const consumerBundle = path.at(-1);
  const consumerPath = consumerBundle ? logicalNodePath(consumerBundle) : "";
  for (const [id, candidates] of [...byId.entries()].sort(([left], [right]) =>
    compareUtf8Bytes(left, right),
  )) {
    candidates.sort((left, right) => left.bundleIndex - right.bundleIndex);
    const anchor = candidates[0];
    if (!anchor?.revision) continue;
    const anchorBundle = path[anchor.bundleIndex];
    const anchorPath = anchorBundle ? logicalNodePath(anchorBundle) : "";
    const isOwnership = anchor.revision.domain === "ownership";
    const delegates = validAnchorDelegates(
      anchor,
      anchorPath,
      isOwnership,
      diagnostics,
    );
    let winner = anchor;

    for (const candidate of candidates.slice(1)) {
      if (!candidate.revision) continue;
      const candidateBundle = path[candidate.bundleIndex];
      const candidatePath = candidateBundle
        ? logicalNodePath(candidateBundle)
        : "";
      if (candidate.revision.delegates?.length) {
        diagnostics.push(
          ignoredDelegates(
            candidatePath,
            id,
            "Delegated entries cannot re-delegate authority.",
          ),
        );
      }

      const delegated =
        isOwnership &&
        candidate.revision.domain === "ownership" &&
        delegates.some(
          (node) =>
            isAtOrBelow(candidatePath, node) && isAtOrBelow(consumerPath, node),
        );
      const scopeOnly = sameAuthorityPayload(
        anchor.revision,
        candidate.revision,
      );
      if (!delegated && !scopeOnly) {
        diagnostics.push({
          code: "resolution.unauthorised-shadow",
          severity: "error",
          message: `Authority entry ${JSON.stringify(id)} at ${JSON.stringify(candidatePath)} was discarded because its anchor did not delegate redefinition.`,
          path: candidatePath,
          entryId: id,
          details: { bundle: candidatePath },
        });
        continue;
      }

      if (
        !lattice.narrowerOrEqual(
          candidate.revision.scope,
          winner.revision?.scope ?? anchor.revision.scope,
        )
      ) {
        resolutionErrors.push({
          code: "widening",
          node: candidatePath,
          id,
          detail: "Closer scope does not narrow the preceding authority scope.",
        });
        winner = candidate;
        continue;
      }
      winner = candidate;
    }

    if (resolutionErrors.some((error) => error.id === id)) continue;
    entries.push(toResolvedEntry(winner, today));
  }

  return Object.freeze({
    entries: Object.freeze(entries),
    resolutionErrors: Object.freeze(resolutionErrors),
    diagnostics: Object.freeze(diagnostics),
  });
}

function validAnchorDelegates(
  anchor: RevisionSelection,
  anchorPath: string,
  isOwnership: boolean,
  diagnostics: Diagnostic[],
): readonly string[] {
  const declared = anchor.revision?.delegates ?? [];
  if (declared.length === 0) return [];
  if (!isOwnership) {
    diagnostics.push(
      ignoredDelegates(
        anchorPath,
        anchor.id,
        "Decision authority cannot be delegated.",
      ),
    );
    return [];
  }
  const accepted: string[] = [];
  for (const node of declared) {
    if (node === anchorPath) {
      diagnostics.push(
        ignoredDelegates(
          anchorPath,
          anchor.id,
          "An anchoring bundle cannot delegate authority to itself.",
        ),
      );
    } else {
      accepted.push(node);
    }
  }
  return accepted;
}

function ignoredDelegates(
  path: string,
  entryId: string,
  message: string,
): Diagnostic {
  return {
    code: "resolution.ignored-delegates",
    severity: "warning",
    message,
    path,
    entryId,
  };
}

function sameAuthorityPayload(
  anchor: EntryRevision,
  candidate: EntryRevision,
): boolean {
  return (
    identifierCanonicalJson(authorityPayload(anchor)) ===
    identifierCanonicalJson(authorityPayload(candidate))
  );
}

function authorityPayload(revision: EntryRevision): Record<string, unknown> {
  return {
    id: revision.id,
    owner: revision.owner,
    status: revision.status,
    source: revision.source,
    domain: revision.domain,
    body: revision.body,
    ...(revision.revisit === undefined ? {} : { revisit: revision.revisit }),
    ...(revision.ref === undefined ? {} : { ref: revision.ref }),
    ...(revision.upstream === undefined ? {} : { upstream: revision.upstream }),
  };
}

function toResolvedEntry(
  selection: RevisionSelection,
  today: string,
): ResolvedEntry {
  const revision = selection.revision;
  if (!revision) throw new Error("authority selection lacks a revision");
  return Object.freeze({
    revision,
    bundleIndex: selection.bundleIndex,
    contested: selection.state === "contested",
    staleReasons: Object.freeze(
      revision.revisit !== undefined && revision.revisit < today
        ? (["revisit"] as const)
        : [],
    ),
  });
}
