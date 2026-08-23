import { compareUtf8Bytes } from "../diagnostics/sort.js";
import type {
  ResolvedContext,
  ResolvedEntry,
  WithheldMarker,
} from "../resolver/types.js";
import { compareResolvedEntries } from "../resolver/order.js";

const CORE_DOMAINS = [
  "identity",
  "glossary",
  "decision",
  "policy",
  "ownership",
  "done",
] as const;

function isWithheld(
  entry: ResolvedEntry | WithheldMarker,
): entry is WithheldMarker {
  return "withheld" in entry;
}

function displayDomain(domain: string): string {
  const known = CORE_DOMAINS.find((value) => value === domain);
  return known === undefined
    ? domain
    : `${known.slice(0, 1).toUpperCase()}${known.slice(1)}`;
}

function orderedDomains(entries: readonly ResolvedEntry[]): readonly string[] {
  const present = new Set(entries.map(({ revision }) => revision.domain));
  const custom = [...present]
    .filter(
      (domain) =>
        !CORE_DOMAINS.includes(domain as (typeof CORE_DOMAINS)[number]),
    )
    .sort(compareUtf8Bytes);
  return [...CORE_DOMAINS.filter((domain) => present.has(domain)), ...custom];
}

function renderEntry(entry: ResolvedEntry): string {
  const { revision } = entry;
  const metadata = [
    `owner: \`${revision.owner}\``,
    `scope: \`${revision.scope}\``,
    `source: \`${revision.source}\``,
    `revision: \`${String(revision.rev)}\``,
    ...(revision.action === undefined
      ? []
      : [`action: \`${revision.action}\``]),
    ...(revision.effect === undefined
      ? []
      : [`effect: \`${revision.effect}\``]),
    ...(revision.route === undefined ? [] : [`route: \`${revision.route}\``]),
    ...(entry.contested ? ["CONTESTED — reliance requires escalation"] : []),
    ...(entry.staleReasons.length === 0
      ? []
      : [
          `STALE (${[...entry.staleReasons].sort(compareUtf8Bytes).join(", ")}) — reliance requires escalation`,
        ]),
  ];
  return [`#### \`${revision.id}\``, ...metadata, "", revision.body].join("\n");
}

export function renderDomainSections(context: ResolvedContext): string {
  const entries = context.entries.filter(
    (entry): entry is ResolvedEntry => !isWithheld(entry),
  );
  const groups = new Map<string, ResolvedEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.revision.domain) ?? [];
    group.push(entry);
    groups.set(entry.revision.domain, group);
  }
  const sections = orderedDomains(entries).map((domain) => {
    const values = groups.get(domain) ?? [];
    values.sort(compareResolvedEntries);
    return [`### ${displayDomain(domain)}`, ...values.map(renderEntry)].join(
      "\n\n",
    );
  });
  const withheldCount = context.entries.filter(isWithheld).length;
  if (withheldCount > 0) {
    sections.push(
      [
        "### Withheld",
        `Withheld entries: ${String(withheldCount)} (clearance).`,
      ].join("\n\n"),
    );
  }
  return sections.join("\n\n");
}

function bundleLine(context: ResolvedContext): string {
  return context.bundles
    .map(({ bundleId, contentId }) => `${bundleId}=${contentId}`)
    .join(", ");
}

export function renderAgentsMd(context: ResolvedContext): string {
  return (
    [
      `<!-- orgmd:begin profile=orgmd-agents-md-v1 advisory=true context=${context.contextId} -->`,
      `<!-- bundles: ${bundleLine(context)} -->`,
      "## Organisational context (advisory)",
    ].join("\n") + `\n\n${renderDomainSections(context)}\n<!-- orgmd:end -->`
  );
}

export function renderBundleLine(context: ResolvedContext): string {
  return bundleLine(context);
}
