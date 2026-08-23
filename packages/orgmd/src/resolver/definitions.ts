import { compareUtf8Bytes } from "../diagnostics/sort.js";
import type { ValidatedBundle } from "../model/types.js";
import { logicalNodePath } from "./nodes.js";
import type { RevisionSelection } from "./revisions.js";
import type { ScopeLattice } from "./scopes.js";
import type { ResolutionError, ResolvedEntry } from "./types.js";

export interface DefinitionResolution {
  readonly entries: readonly ResolvedEntry[];
  readonly resolutionErrors: readonly ResolutionError[];
}

export function isOrdinaryDefinition(selection: RevisionSelection): boolean {
  const domain = selection.revision?.domain;
  return (
    domain !== undefined &&
    domain !== "policy" &&
    domain !== "ownership" &&
    domain !== "decision"
  );
}

export function resolveOrdinaryDefinitions(
  selections: readonly RevisionSelection[],
  path: readonly ValidatedBundle[],
  lattice: ScopeLattice,
  today: string,
): DefinitionResolution {
  const contributors = new Map<string, RevisionSelection[]>();
  for (const selection of selections) {
    if (!selection.revision || !isOrdinaryDefinition(selection)) continue;
    const revisions = contributors.get(selection.id) ?? [];
    revisions.push(selection);
    contributors.set(selection.id, revisions);
  }

  const entries: ResolvedEntry[] = [];
  const resolutionErrors: ResolutionError[] = [];
  for (const [id, candidates] of [...contributors.entries()].sort(
    ([left], [right]) => compareUtf8Bytes(left, right),
  )) {
    candidates.sort((left, right) => left.bundleIndex - right.bundleIndex);
    let widenedAt: RevisionSelection | undefined;
    for (let index = 1; index < candidates.length; index += 1) {
      const preceding = candidates[index - 1]?.revision;
      const closer = candidates[index]?.revision;
      if (
        preceding &&
        closer &&
        !lattice.narrowerOrEqual(closer.scope, preceding.scope)
      ) {
        widenedAt = candidates[index];
        break;
      }
    }
    if (widenedAt) {
      const widenedBundle = path[widenedAt.bundleIndex];
      resolutionErrors.push(
        Object.freeze({
          code: "widening",
          node: widenedBundle ? logicalNodePath(widenedBundle) : "",
          id,
          detail:
            "Closer scope does not narrow the preceding definition scope.",
        }),
      );
      continue;
    }

    const winner = candidates.at(-1);
    if (!winner?.revision) continue;
    const staleReasons =
      winner.revision.revisit !== undefined && winner.revision.revisit < today
        ? (["revisit"] as const)
        : [];
    entries.push(
      Object.freeze({
        revision: winner.revision,
        bundleIndex: winner.bundleIndex,
        contested: winner.state === "contested",
        staleReasons: Object.freeze([...staleReasons]),
      }),
    );
  }

  return Object.freeze({
    entries: Object.freeze(entries),
    resolutionErrors: Object.freeze(resolutionErrors),
  });
}
