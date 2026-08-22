import { compareUtf8Bytes } from "../diagnostics/sort.js";
import type { ResolvedEntry } from "./types.js";

/** Total order for visible contributors: id, then root-to-node bundle index. */
export function compareResolvedEntries(
  left: ResolvedEntry,
  right: ResolvedEntry,
): number {
  return (
    compareUtf8Bytes(left.revision.id, right.revision.id) ||
    left.bundleIndex - right.bundleIndex
  );
}
