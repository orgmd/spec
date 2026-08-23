import type { AdoptCandidate, AdoptDomain } from "./types.js";

interface Line {
  readonly text: string;
  readonly start: number;
  readonly endWithEnding: number;
}

interface Section {
  readonly heading: string;
  readonly contentStart: number;
  readonly contentEnd: number;
}

/**
 * Splits ordinary Markdown without normalizing or interpreting its source
 * slices. The heading-name table produces only a visible domain suggestion.
 */
export function extractMarkdownCandidates(
  sourceText: string,
): readonly AdoptCandidate[] {
  const lines = linesOf(sourceText);
  const candidates: Omit<AdoptCandidate, "candidateId">[] = [];
  for (const section of sections(lines, sourceText.length)) {
    const suggestedDomain = suggestDomain(section.heading);
    for (const slice of blocks(lines, section, sourceText)) {
      candidates.push({
        sourceHeading: section.heading,
        sourceText: slice,
        status: "draft",
        suggestedDomain,
        requiredInputs: ["domain", "owner", "scope"],
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

function linesOf(source: string): readonly Line[] {
  const lines: Line[] = [];
  let start = 0;
  while (start < source.length) {
    const newline = source.indexOf("\n", start);
    const endWithEnding = newline === -1 ? source.length : newline + 1;
    const contentEnd =
      newline === -1
        ? source.length
        : source[newline - 1] === "\r"
          ? newline - 1
          : newline;
    lines.push({
      text: source.slice(start, contentEnd),
      start,
      endWithEnding,
    });
    start = endWithEnding;
  }
  return Object.freeze(lines);
}

function sections(
  lines: readonly Line[],
  sourceLength: number,
): readonly Section[] {
  const found: { readonly heading: string; readonly contentLine: number }[] =
    [];
  let fence: Fence | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.text ?? "";
    if (fence) {
      if (closesFence(line, fence)) fence = undefined;
      continue;
    }
    const atx = /^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (atx?.[1]) {
      found.push({ heading: atx[1].trim(), contentLine: index + 1 });
      continue;
    }
    const underline = lines[index + 1]?.text ?? "";
    if (line.trim().length > 0 && /^ {0,3}(?:=+|-+)[ \t]*$/.test(underline)) {
      found.push({ heading: line.trim(), contentLine: index + 2 });
      index += 1;
      continue;
    }
    fence = opensFence(line);
  }
  if (found.length === 0) {
    return Object.freeze([
      Object.freeze({
        heading: "Document",
        contentStart: 0,
        contentEnd: sourceLength,
      }),
    ]);
  }
  return Object.freeze(
    found.map((section, index) => {
      const next = found[index + 1];
      const start = lines[section.contentLine]?.start ?? sourceLength;
      const nextHeading =
        next === undefined ? undefined : headingLine(lines, next);
      return Object.freeze({
        heading: section.heading,
        contentStart: start,
        contentEnd: nextHeading?.start ?? sourceLength,
      });
    }),
  );
}

function headingLine(
  lines: readonly Line[],
  section: { readonly contentLine: number },
): Line | undefined {
  const beforeContent = section.contentLine - 1;
  return /^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[beforeContent]?.text ?? "")
    ? lines[beforeContent - 1]
    : lines[beforeContent];
}

function blocks(
  lines: readonly Line[],
  section: Section,
  source: string,
): readonly string[] {
  const startLine = lines.findIndex(
    ({ start }) => start >= section.contentStart,
  );
  const endLine = lines.findIndex(({ start }) => start >= section.contentEnd);
  const limit = endLine === -1 ? lines.length : endLine;
  const result: string[] = [];
  let index = startLine === -1 ? lines.length : startLine;
  while (index < limit) {
    while (index < limit && (lines[index]?.text.trim() ?? "") === "")
      index += 1;
    if (index >= limit) break;
    const opening = opensFence(lines[index]?.text ?? "");
    if (opening) {
      const first = lines[index]!;
      index += 1;
      while (index < limit && !closesFence(lines[index]?.text ?? "", opening))
        index += 1;
      if (index < limit) index += 1;
      result.push(source.slice(first.start, lines[index - 1]!.endWithEnding));
      continue;
    }
    if (isListItem(lines[index]?.text ?? "")) {
      const line = lines[index]!;
      result.push(source.slice(line.start, line.endWithEnding));
      index += 1;
      continue;
    }
    const first = lines[index]!;
    while (
      index < limit &&
      (lines[index]?.text.trim() ?? "") !== "" &&
      !isListItem(lines[index]?.text ?? "")
    ) {
      index += 1;
    }
    result.push(source.slice(first.start, lines[index - 1]!.endWithEnding));
  }
  return Object.freeze(result);
}

function isListItem(line: string): boolean {
  return /^ {0,3}(?:[-+*]|\d+[.)])[ \t]+/.test(line);
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
