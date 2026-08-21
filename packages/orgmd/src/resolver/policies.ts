import { compareUtf8Bytes } from "../diagnostics/sort.js";
import type { ValidatedBundle } from "../model/types.js";
import { actionContains, effectStrength, isValidAction } from "./actions.js";
import type { RevisionSelection } from "./revisions.js";
import type { ScopeLattice } from "./scopes.js";
import type { ResolutionError, ResolvedEntry } from "./types.js";

export interface PolicyResolution {
  readonly entries: readonly ResolvedEntry[];
  readonly resolutionErrors: readonly ResolutionError[];
}

export function isConstraint(selection: RevisionSelection): boolean {
  return selection.revision?.domain === "policy";
}

export function resolvePolicies(
  selections: readonly RevisionSelection[],
  path: readonly ValidatedBundle[],
  lattice: ScopeLattice,
  ownershipRoutes: ReadonlySet<string>,
  today: string,
): PolicyResolution {
  const byId = new Map<string, RevisionSelection[]>();
  for (const selection of selections) {
    if (!selection.revision || !isConstraint(selection)) continue;
    const candidates = byId.get(selection.id) ?? [];
    candidates.push(selection);
    byId.set(selection.id, candidates);
  }

  const entries: ResolvedEntry[] = [];
  const resolutionErrors: ResolutionError[] = [];
  for (const [id, candidates] of [...byId.entries()].sort(([left], [right]) =>
    compareUtf8Bytes(left, right),
  )) {
    candidates.sort((left, right) => left.bundleIndex - right.bundleIndex);
    let failed = false;
    let previous: RevisionSelection | undefined;
    for (const candidate of candidates) {
      const revision = candidate.revision;
      if (!revision) continue;
      const node = path[candidate.bundleIndex]?.path ?? "";
      if (revision.action === undefined) {
        resolutionErrors.push({
          code: "invalid_entry",
          node,
          id,
          detail: "A policy entry is missing its required action.",
        });
        failed = true;
      } else if (!isValidAction(revision.action)) {
        resolutionErrors.push({
          code: "invalid_action",
          node,
          id,
          detail: "An entry has an invalid action value.",
        });
        failed = true;
      }
      if (
        revision.effect !== "allow" &&
        revision.effect !== "escalate" &&
        revision.effect !== "deny"
      ) {
        resolutionErrors.push({
          code: "invalid_entry",
          node,
          id,
          detail: "A policy entry has an invalid or missing effect.",
        });
        failed = true;
      } else if (
        revision.effect === "escalate" &&
        revision.route === undefined
      ) {
        resolutionErrors.push({
          code: "invalid_entry",
          node,
          id,
          detail: "An escalating policy entry is missing its required route.",
        });
        failed = true;
      } else if (
        revision.effect === "escalate" &&
        revision.route !== undefined &&
        !ownershipRoutes.has(revision.route)
      ) {
        resolutionErrors.push({
          code: "unresolvable_route",
          node,
          id,
          detail:
            "A policy escalation route does not resolve in the ownership domain.",
        });
        failed = true;
      }

      const parent = previous?.revision;
      if (
        parent?.action !== undefined &&
        isValidAction(parent.action) &&
        parent.effect !== undefined &&
        revision.action !== undefined &&
        isValidAction(revision.action) &&
        revision.effect !== undefined &&
        lattice.labels.has(parent.scope) &&
        lattice.labels.has(revision.scope) &&
        (!actionContains(parent.action, revision.action) ||
          effectStrength(revision.effect) < effectStrength(parent.effect) ||
          !lattice.narrowerOrEqual(revision.scope, parent.scope))
      ) {
        resolutionErrors.push({
          code: "widening",
          node,
          id,
          detail:
            "A closer same-id constraint widens its parent; use a new id for a distinct rule.",
        });
        failed = true;
      }
      previous = candidate;
    }

    if (failed) continue;
    for (const candidate of candidates) {
      if (!candidate.revision) continue;
      entries.push(
        Object.freeze({
          revision: candidate.revision,
          bundleIndex: candidate.bundleIndex,
          contested: candidate.state === "contested",
          staleReasons: Object.freeze(
            candidate.revision.revisit !== undefined &&
              candidate.revision.revisit < today
              ? (["revisit"] as const)
              : [],
          ),
        }),
      );
    }
  }

  return Object.freeze({
    entries: Object.freeze(entries),
    resolutionErrors: Object.freeze(resolutionErrors),
  });
}
