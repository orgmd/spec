import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { validateBundlePath } from "../validation/validate.js";
import type { Diagnostic } from "../diagnostics/types.js";
import type { ValidatedBundle } from "../model/types.js";

export async function discoverCompilePath(reference: string): Promise<{
  readonly value?: readonly ValidatedBundle[];
  readonly diagnostics: readonly Diagnostic[];
  readonly paths: readonly string[];
}> {
  let target: string;
  try {
    target = await realpath(reference);
    if (!(await stat(target)).isDirectory()) throw new Error();
  } catch {
    return failure(
      "cli.invalid-path",
      "Bundle path must resolve to a readable directory.",
      reference,
    );
  }
  const ancestors: string[] = [];
  for (let current = target; ; current = dirname(current)) {
    if (await containsOrg(current)) ancestors.push(current);
    const parent = dirname(current);
    if (parent === current) break;
  }
  ancestors.reverse();
  if (ancestors.length === 0)
    return failure(
      "cli.no-org-file",
      "No org.md bundle was found from filesystem root to the target.",
      target,
    );
  const seen = new Set<string>();
  if (ancestors.some((path) => seen.has(path) || !seen.add(path)))
    return failure(
      "cli.duplicate-bundle",
      "The discovered bundle path contains a duplicate real path.",
      target,
    );
  const root = ancestors[0]!;
  const values: ValidatedBundle[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const [index, path] of ancestors.entries()) {
    const nodePath =
      index === 0 ? "root" : relative(root, path).split(sep).join("/");
    const result = await validateBundlePath(path, {
      isRoot: index === 0,
      nodePath,
    });
    diagnostics.push(...result.diagnostics);
    if (result.value) values.push(result.value);
  }
  return diagnostics.some(({ severity }) => severity === "error")
    ? {
        diagnostics: Object.freeze(diagnostics),
        paths: Object.freeze(ancestors),
      }
    : {
        value: Object.freeze(values),
        diagnostics: Object.freeze(diagnostics),
        paths: Object.freeze(ancestors),
      };
}

async function containsOrg(path: string): Promise<boolean> {
  try {
    return (await lstat(join(path, "org.md"))).isFile();
  } catch {
    return false;
  }
}
function failure(code: string, message: string, path: string) {
  return {
    diagnostics: Object.freeze([
      { code, severity: "error" as const, message, path },
    ]),
    paths: Object.freeze([]),
  };
}
