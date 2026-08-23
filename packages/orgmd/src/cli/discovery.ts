import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { validateBundlePath } from "../validation/validate.js";
import type { Diagnostic } from "../diagnostics/types.js";
import type { ValidatedBundle } from "../model/types.js";

export async function discoverCompilePath(reference: string): Promise<{
  readonly value?: readonly ValidatedBundle[];
  readonly diagnostics: readonly Diagnostic[];
  readonly paths: readonly string[];
}>;
export async function discoverCompilePath(
  reference: string,
  io: DiscoveryIo,
): Promise<{
  readonly value?: readonly ValidatedBundle[];
  readonly diagnostics: readonly Diagnostic[];
  readonly paths: readonly string[];
}>;
export async function discoverCompilePath(
  reference: string,
  io: DiscoveryIo = defaultDiscoveryIo,
): Promise<{
  readonly value?: readonly ValidatedBundle[];
  readonly diagnostics: readonly Diagnostic[];
  readonly paths: readonly string[];
}> {
  let target: string;
  try {
    target = await io.realpath(reference);
    if (!(await io.stat(target)).isDirectory()) throw new Error();
  } catch {
    return failure(
      "cli.invalid-path",
      "Bundle path must resolve to a readable directory.",
      reference,
    );
  }
  const ancestors: string[] = [];
  for (let current = target; ; current = dirname(current)) {
    const org = await containsOrg(current, io);
    if (org.diagnostic)
      return {
        diagnostics: Object.freeze([org.diagnostic]),
        paths: Object.freeze([]),
      };
    if (org.present) ancestors.push(current);
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

export interface DiscoveryIo {
  readonly realpath: typeof realpath;
  readonly stat: typeof stat;
  readonly lstat: typeof lstat;
}

const defaultDiscoveryIo: DiscoveryIo = Object.freeze({
  realpath,
  stat,
  lstat,
});

async function containsOrg(
  path: string,
  io: DiscoveryIo,
): Promise<{ readonly present: boolean; readonly diagnostic?: Diagnostic }> {
  try {
    return { present: (await io.lstat(join(path, "org.md"))).isFile() };
  } catch (error) {
    if (isMissing(error)) return { present: false };
    return {
      present: false,
      diagnostic: {
        code: "cli.discovery-failed",
        severity: "error",
        message: "Bundle discovery could not inspect org.md.",
        path,
      },
    };
  }
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
function failure(code: string, message: string, path: string) {
  return {
    diagnostics: Object.freeze([
      { code, severity: "error" as const, message, path },
    ]),
    paths: Object.freeze([]),
  };
}
