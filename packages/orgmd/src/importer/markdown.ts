import type { AdoptCandidate, AdoptDomain } from "./types.js";

interface Section {
  readonly heading: string;
  readonly lines: readonly string[];
}

/**
 * Splits ordinary Markdown without interpreting its meaning. The only
 * classification is the documented heading-name suggestion table.
 */
export function extractMarkdownCandidates(
  sourceText: string,
): readonly AdoptCandidate[] {
  const candidates: Omit<AdoptCandidate, "candidateId">[] = [];
  for (const section of sections(sourceText)) {
    const suggestedDomain = suggestDomain(section.heading);
    for (const sourceText of blocks(section.lines)) {
      candidates.push({
        sourceHeading: section.heading,
        sourceText,
        status: "draft",
        suggestedDomain,
        requiredInputs: requiredInputs(suggestedDomain),
      });
    }
  }

  const used = new Map<string, number>();
  return Object.freeze(
    candidates.map((candidate) => {
      const base = `${prefix(candidate.suggestedDomain)}.${slug(candidate.sourceHeading)}`;
      const count = (used.get(base) ?? 0) + 1;
      used.set(base, count);
      return Object.freeze({
        ...candidate,
        candidateId: count === 1 ? base : `${base}-${String(count)}`,
        requiredInputs: Object.freeze([...candidate.requiredInputs]),
      });
    }),
  );
}

function sections(sourceText: string): readonly Section[] {
  const lines = sourceText.replace(/\r\n/g, "\n").split("\n");
  const found: { heading: string; contentStart: number }[] = [];
  let fence: Fence | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (fence) {
      if (closesFence(line, fence)) fence = undefined;
      continue;
    }
    const atx = /^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (atx?.[1]) {
      found.push({ heading: atx[1].trim(), contentStart: index + 1 });
      continue;
    }
    const underline = lines[index + 1] ?? "";
    if (line.trim().length > 0 && /^ {0,3}(?:=+|-+)[ \t]*$/.test(underline)) {
      found.push({ heading: line.trim(), contentStart: index + 2 });
      index += 1;
      continue;
    }
    fence = opensFence(line);
  }

  if (found.length === 0) {
    return Object.freeze([
      Object.freeze({ heading: "Document", lines: Object.freeze(lines) }),
    ]);
  }
  return Object.freeze(
    found.map((section, index) =>
      Object.freeze({
        heading: section.heading,
        lines: Object.freeze(
          lines.slice(
            section.contentStart,
            found[index + 1]?.contentStart === undefined
              ? lines.length
              : headingStart(lines, found[index + 1]!),
          ),
        ),
      }),
    ),
  );
}

function headingStart(
  lines: readonly string[],
  section: { readonly contentStart: number },
): number {
  const beforeContent = section.contentStart - 1;
  return /^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[beforeContent] ?? "")
    ? beforeContent - 1
    : beforeContent;
}

function blocks(lines: readonly string[]): readonly string[] {
  const result: string[] = [];
  let index = 0;
  while (index < lines.length) {
    while (index < lines.length && (lines[index] ?? "").trim() === "")
      index += 1;
    if (index >= lines.length) break;
    const opening = opensFence(lines[index] ?? "");
    if (opening) {
      const start = index;
      index += 1;
      while (index < lines.length && !closesFence(lines[index] ?? "", opening))
        index += 1;
      if (index < lines.length) index += 1;
      result.push(lines.slice(start, index).join("\n"));
      continue;
    }
    const list = listItem(lines[index] ?? "");
    if (list !== undefined) {
      result.push(list);
      index += 1;
      continue;
    }
    const start = index;
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() !== "" &&
      listItem(lines[index] ?? "") === undefined
    ) {
      index += 1;
    }
    const paragraph = lines.slice(start, index).join("\n").trim();
    if (paragraph.length > 0) result.push(paragraph);
  }
  return Object.freeze(result);
}

function listItem(line: string): string | undefined {
  return /^ {0,3}(?:[-+*]|\d+[.)])[ \t]+(.+?)\s*$/.exec(line)?.[1];
}

function suggestDomain(heading: string): AdoptDomain {
  const normalized = heading.trim().toLowerCase();
  if (normalized === "terms" || normalized === "glossary") return "glossary";
  if (
    normalized === "rules" ||
    normalized === "policies" ||
    normalized === "constraints"
  ) {
    return "policy";
  }
  return "identity";
}

function requiredInputs(
  domain: AdoptDomain,
): readonly AdoptCandidate["requiredInputs"][number][] {
  return domain === "policy"
    ? ["owner", "scope", "revisit", "action", "effect"]
    : ["owner", "scope"];
}

function prefix(domain: AdoptDomain): string {
  return domain === "glossary" ? "term" : domain === "policy" ? "pol" : "org";
}

function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "entry"
  );
}

interface Fence {
  readonly marker: "`" | "~";
  readonly length: number;
}

function opensFence(line: string): Fence | undefined {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match?.[1]) return undefined;
  if (match[1][0] === "`" && match[2]?.includes("`")) return undefined;
  return { marker: match[1][0] as Fence["marker"], length: match[1].length };
}

function closesFence(line: string, fence: Fence): boolean {
  const marker = fence.marker === "`" ? "\\x60" : "~";
  return new RegExp(`^ {0,3}${marker}{${String(fence.length)},}[ \\t]*$`).test(
    line,
  );
}
