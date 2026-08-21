import { sortDiagnostics } from "../diagnostics/sort.js";
import type { Diagnostic, OperationResult } from "../diagnostics/types.js";
import type { Domain, ParsedEntryRevision } from "../model/types.js";
import { parseYamlMapping } from "./yaml.js";

export interface ParserLimits {
  readonly maxFileBytes: number;
  readonly maxEntriesPerFile: number;
  readonly maxYamlAliases: number;
}

export interface ParseContentFileInput {
  readonly path: string;
  readonly domain: Domain;
  readonly bytes: Uint8Array;
  readonly limits?: Partial<ParserLimits>;
}

const defaultLimits: ParserLimits = Object.freeze({
  maxFileBytes: 16 * 1024 * 1024,
  maxEntriesPerFile: 10_000,
  maxYamlAliases: 100,
});

interface EntryRecord {
  readonly openingLine: number;
  readonly yaml: string;
  readonly body: string;
  readonly openedFromBodyDelimiter: boolean;
}

export function parseContentFile(
  input: ParseContentFileInput,
): OperationResult<readonly ParsedEntryRevision[]> {
  const limits = { ...defaultLimits, ...input.limits };
  if (input.bytes.byteLength > limits.maxFileBytes) {
    return failure(resourceLimit(input.path, "file size"));
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true })
      .decode(input.bytes)
      .replace(/^\uFEFF/, "");
  } catch {
    return failure({
      code: "parser.invalid-utf8",
      severity: "error",
      message: "Content files must be valid UTF-8.",
      path: input.path,
      line: 1,
    });
  }
  if (/\r(?!\n)/.test(text)) {
    return failure({
      code: "parser.invalid-line-ending",
      severity: "error",
      message: "Content files may use only LF or CRLF line endings.",
      path: input.path,
      line: 1,
    });
  }
  text = text.replace(/\r\n/g, "\n");

  const scan = scanEntryRecords(text, input.path, limits.maxEntriesPerFile);
  if (scan.diagnostics.length > 0) return failure(...scan.diagnostics);
  if (scan.records.length === 0) {
    return {
      value: Object.freeze([]),
      diagnostics: sortDiagnostics([
        {
          code: "parser.not-content-file",
          severity: "warning",
          message:
            "File does not begin with an ORG.md entry delimiter and was ignored.",
          path: input.path,
          line: 1,
        },
      ]),
    };
  }

  const entries: ParsedEntryRevision[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const record of scan.records) {
    const yaml = parseYamlMapping({
      source: record.yaml,
      path: input.path,
      openingLine: record.openingLine,
      maxAliases: limits.maxYamlAliases,
    });
    if (
      record.openedFromBodyDelimiter &&
      yaml.diagnostics.some(
        ({ code }) => code === "parser.invalid-yaml-mapping",
      )
    ) {
      diagnostics.push(bodyDelimiterDiagnostic(input.path, record.openingLine));
    } else {
      diagnostics.push(...yaml.diagnostics);
    }
    if (yaml.mapping) {
      entries.push(
        Object.freeze({
          frontMatter: yaml.mapping,
          body: record.body,
          domain: input.domain,
          sourcePath: input.path,
          line: record.openingLine,
        }),
      );
    }
  }

  if (diagnostics.length > 0) return failure(...diagnostics);
  return {
    value: Object.freeze(entries),
    diagnostics: Object.freeze([]),
  };
}

function scanEntryRecords(
  text: string,
  path: string,
  maxEntries: number,
): {
  readonly records: readonly EntryRecord[];
  readonly diagnostics: readonly Diagnostic[];
} {
  const lines = text.split("\n");
  if (lines[0] !== "---") return { records: [], diagnostics: [] };

  const records: EntryRecord[] = [];
  let openingIndex = 0;
  while (openingIndex < lines.length) {
    if (records.length >= maxEntries) {
      return { records: [], diagnostics: [resourceLimit(path, "entry count")] };
    }
    const closingIndex = findClosingDelimiter(lines, openingIndex + 1);
    if (closingIndex === -1) {
      return {
        records: [],
        diagnostics: [
          openingIndex === 0
            ? missingClosingDelimiterDiagnostic(path, openingIndex + 1)
            : bodyDelimiterDiagnostic(path, openingIndex + 1),
        ],
      };
    }
    const nextOpeningIndex = findNextOpeningDelimiter(lines, closingIndex + 1);
    records.push({
      openingLine: openingIndex + 1,
      yaml: lines.slice(openingIndex + 1, closingIndex).join("\n"),
      openedFromBodyDelimiter: openingIndex !== 0,
      body: trimBody(
        lines.slice(
          closingIndex + 1,
          nextOpeningIndex === -1 ? lines.length : nextOpeningIndex,
        ),
      ),
    });
    if (nextOpeningIndex === -1) break;
    openingIndex = nextOpeningIndex;
  }
  return { records, diagnostics: [] };
}

function findClosingDelimiter(lines: readonly string[], start: number): number {
  for (let index = start; index < lines.length - 1; index += 1) {
    if (lines[index] === "---") return index;
  }
  return -1;
}

function findNextOpeningDelimiter(
  lines: readonly string[],
  start: number,
): number {
  let fence:
    { readonly character: "`" | "~"; readonly length: number } | undefined;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (fence) {
      if (isClosingFence(line, fence)) fence = undefined;
      continue;
    }
    if (
      line === "---" &&
      index > start &&
      isBlankLine(lines[index - 1] ?? "")
    ) {
      return index;
    }
    fence = openingFence(line);
  }
  return -1;
}

function openingFence(
  line: string,
): { readonly character: "`" | "~"; readonly length: number } | undefined {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match?.[1]) return undefined;
  const run = match[1];
  if (run[0] === "`" && match[2]?.includes("`")) return undefined;
  return { character: run[0] as "`" | "~", length: run.length };
}

function isClosingFence(
  line: string,
  fence: { readonly character: "`" | "~"; readonly length: number },
): boolean {
  const marker = fence.character === "`" ? "\\x60" : "~";
  return new RegExp(`^ {0,3}${marker}{${fence.length},}[ \\t]*$`).test(line);
}

function trimBody(lines: readonly string[]): string {
  let first = 0;
  let last = lines.length;
  while (first < last && isBlankLine(lines[first] ?? "")) first += 1;
  while (last > first && isBlankLine(lines[last - 1] ?? "")) last -= 1;
  return lines.slice(first, last).join("\n");
}

function isBlankLine(line: string): boolean {
  return /^[ \t]*$/.test(line);
}

function resourceLimit(path: string, subject: string): Diagnostic {
  return {
    code: "parser.resource-limit",
    severity: "error",
    message: `Parser resource limit exceeded for ${subject}.`,
    path,
    line: 1,
  };
}

function missingClosingDelimiterDiagnostic(
  path: string,
  line: number,
): Diagnostic {
  return {
    code: "parser.missing-closing-delimiter",
    severity: "error",
    message: "An entry opening delimiter must have a closing delimiter.",
    path,
    line,
  };
}

function bodyDelimiterDiagnostic(path: string, line: number): Diagnostic {
  return {
    code: "parser.unescaped-body-delimiter",
    severity: "error",
    message:
      "A `---` line outside a fence and preceded by a blank line necessarily opens a record; it cannot be escaped.",
    path,
    line,
  };
}

function failure(
  ...diagnostics: readonly Diagnostic[]
): OperationResult<never> {
  return { diagnostics: sortDiagnostics(diagnostics) };
}
