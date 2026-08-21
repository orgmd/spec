import { compareUtf8Bytes } from "../diagnostics/sort.js";
import type { EntryRevision, ValidatedBundle } from "../model/types.js";

export type EntryState =
  "proposed" | "current" | "pending" | "contested" | "retired";

export interface RevisionSelection {
  readonly id: string;
  readonly state: EntryState;
  readonly revision?: EntryRevision;
  readonly bundleIndex: number;
}

export function selectEffectiveRevisions(
  bundle: ValidatedBundle,
  bundleIndex: number,
): readonly RevisionSelection[] {
  const byId = new Map<string, EntryRevision[]>();
  for (const revision of bundle.entries) {
    const revisions = byId.get(revision.id) ?? [];
    revisions.push(revision);
    byId.set(revision.id, revisions);
  }

  const selected = [...byId.entries()]
    .sort(([left], [right]) => compareUtf8Bytes(left, right))
    .map(([id, revisions]): RevisionSelection => {
      const lifecycle = bundle.metadata.lifecycle[id]?.state;
      const approved = revisions
        .filter(({ status }) => status === "approved")
        .reduce<EntryRevision | undefined>(
          (winner, revision) =>
            winner === undefined || revision.rev > winner.rev
              ? revision
              : winner,
          undefined,
        );

      if (lifecycle === "retired") {
        return Object.freeze({ id, state: "retired", bundleIndex });
      }
      if (approved && lifecycle === "contested") {
        return Object.freeze({
          id,
          state: "contested",
          revision: approved,
          bundleIndex,
        });
      }
      if (!approved) {
        return Object.freeze({ id, state: "proposed", bundleIndex });
      }
      const pending = revisions.some(
        ({ rev, status }) => status === "draft" && rev > approved.rev,
      );
      return Object.freeze({
        id,
        state: pending ? "pending" : "current",
        revision: approved,
        bundleIndex,
      });
    });

  return Object.freeze(selected);
}
