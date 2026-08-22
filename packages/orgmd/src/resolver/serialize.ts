import {
  entryCanonicalForm,
  identifierCanonicalJson,
} from "../identifiers/canonical.js";
import { compareResolvedEntries } from "./order.js";
import type {
  ResolvedContext,
  ResolvedEntry,
  WithheldMarker,
} from "./types.js";

function isWithheld(
  entry: ResolvedEntry | WithheldMarker,
): entry is WithheldMarker {
  return "withheld" in entry;
}

export function serializeEffectiveContext(context: ResolvedContext): string {
  const visible = context.entries
    .filter((entry): entry is ResolvedEntry => !isWithheld(entry))
    .sort(compareResolvedEntries)
    .map(({ revision }) => entryCanonicalForm(revision));
  const withheld = context.entries
    .filter(isWithheld)
    .map(() => ({ withheld: true, reason: "clearance" as const }));
  return identifierCanonicalJson({
    entries: [...visible, ...withheld],
    bundles: context.bundles.map(({ path, contentId }) => ({
      path,
      content_id: contentId,
    })),
  });
}
