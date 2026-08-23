import { isMap, parseDocument } from "yaml";
import type { Diagnostic } from "../diagnostics/types.js";

export interface ParsedYamlMapping {
  readonly mapping?: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly Diagnostic[];
}

export function parseYamlMapping(input: {
  readonly source: string;
  readonly path: string;
  readonly openingLine: number;
  readonly maxAliases: number;
}): ParsedYamlMapping {
  const document = parseDocument(input.source, {
    version: "1.2",
    uniqueKeys: true,
    prettyErrors: false,
    stringKeys: true,
  });

  if (document.errors.length > 0) {
    return {
      diagnostics: document.errors.map((error) => ({
        code:
          error.code === "DUPLICATE_KEY"
            ? "validation.duplicate-yaml-key"
            : "parser.invalid-yaml-mapping",
        severity: "error",
        message:
          error.code === "DUPLICATE_KEY"
            ? "YAML front matter contains a duplicate key."
            : "YAML front matter must be a valid YAML 1.2 mapping.",
        path: input.path,
        line: input.openingLine + lineOffset(input.source, error.pos[0]) + 1,
      })),
    };
  }

  if (!isMap(document.contents)) {
    return {
      diagnostics: [
        {
          code: "parser.invalid-yaml-mapping",
          severity: "error",
          message: "YAML front matter must be a YAML 1.2 mapping.",
          path: input.path,
          line: input.openingLine,
        },
      ],
    };
  }

  try {
    const mapping = document.toJS({
      maxAliasCount: input.maxAliases,
    }) as Record<string, unknown>;
    return { mapping: Object.freeze({ ...mapping }), diagnostics: [] };
  } catch (error) {
    return {
      diagnostics: [
        {
          code: "parser.resource-limit",
          severity: "error",
          message: `YAML alias expansion exceeded the configured limit: ${messageOf(error)}`,
          path: input.path,
          line: input.openingLine,
        },
      ],
    };
  }
}

function lineOffset(source: string, offset: number): number {
  let lines = 0;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") lines += 1;
  }
  return lines;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown YAML error";
}
