import { existsSync, readFileSync } from "node:fs";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import type { Diagnostic } from "../diagnostics/types.js";

const entrySchema = JSON.parse(readFileSync(schemaUrl(), "utf8")) as object;

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
const validate = ajv.compile(entrySchema);

function schemaUrl(): URL {
  const packaged = new URL("../schema/entry.schema.json", import.meta.url);
  return existsSync(packaged)
    ? packaged
    : new URL("../../../../schema/entry.schema.json", import.meta.url);
}

export function validateEntrySchema(
  frontMatter: Readonly<Record<string, unknown>>,
): readonly Diagnostic[] {
  if (validate(frontMatter)) return [];

  return Object.freeze(
    (validate.errors ?? [])
      .filter(({ keyword }) => keyword !== "if")
      .map((error) => toDiagnostic(error, frontMatter)),
  );
}

function toDiagnostic(
  error: ErrorObject,
  frontMatter: Readonly<Record<string, unknown>>,
): Diagnostic {
  const location = locationFor(error);
  return {
    code: codeFor(error, frontMatter),
    severity: "error",
    message: `Entry front matter ${location} ${error.message ?? "is invalid"}.`,
    ...(typeof frontMatter.id === "string" ? { entryId: frontMatter.id } : {}),
    details: {
      instancePath: error.instancePath,
      keyword: error.keyword,
      ...error.params,
    },
  };
}

function codeFor(
  error: ErrorObject,
  frontMatter: Readonly<Record<string, unknown>>,
): string {
  if (isMissingUpstream(error, frontMatter)) {
    return "validation.missing-upstream";
  }
  if (error.instancePath === "/action") return "invalid_action";
  return "invalid_entry";
}

function isMissingUpstream(
  error: ErrorObject,
  frontMatter: Readonly<Record<string, unknown>>,
): boolean {
  if (
    typeof frontMatter.source !== "string" ||
    !frontMatter.source.startsWith("synced:") ||
    error.keyword !== "required"
  ) {
    return false;
  }
  const missingProperty = (error.params as { missingProperty?: unknown })
    .missingProperty;
  return error.instancePath === "/upstream" || missingProperty === "upstream";
}

function locationFor(error: ErrorObject): string {
  if (error.keyword === "required") {
    const missingProperty = (error.params as { missingProperty?: unknown })
      .missingProperty;
    if (typeof missingProperty === "string") {
      return `field ${JSON.stringify(
        `${error.instancePath}/${missingProperty}`.replace(/^\//, ""),
      )}`;
    }
  }
  return error.instancePath
    ? `field ${JSON.stringify(error.instancePath.slice(1))}`
    : "entry";
}
