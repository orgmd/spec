import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { compareUtf8Bytes, sortDiagnostics } from "../diagnostics/sort.js";
import type { Diagnostic, OperationResult } from "../diagnostics/types.js";
import type { Bundle, ParsedEntryRevision } from "../model/types.js";
import { parseContentFile } from "../parser/content-file.js";
import { mapDomain } from "./domain.js";

export async function loadBundle(input: {
  readonly reference: string;
  readonly nodePath?: string;
  readonly isRoot: boolean;
}): Promise<OperationResult<Bundle>> {
  if (input.nodePath !== undefined && !isLogicalNodePath(input.nodePath)) {
    return failure({
      code: "bundle.invalid-node-path",
      severity: "error",
      message:
        "A logical node path must be a non-empty relative slash-separated path.",
    });
  }
  let root: string;
  try {
    root = await realpath(input.reference);
    if (!(await stat(root)).isDirectory()) throw new Error("not a directory");
  } catch {
    return failure({
      code: "bundle.invalid-reference",
      severity: "error",
      message: "Bundle reference must resolve to a readable directory.",
      path: input.reference,
    });
  }

  const enumeration = await enumerate(root);
  if (enumeration.diagnostics.some(({ severity }) => severity === "error")) {
    return failure(...enumeration.diagnostics);
  }

  const diagnostics: Diagnostic[] = [...enumeration.diagnostics];
  if (!enumeration.paths.includes("org.md")) {
    diagnostics.push({
      code: "bundle.missing-org-file",
      severity: "error",
      message: "A bundle must contain org.md.",
      path: "org.md",
    });
  }

  const entries: ParsedEntryRevision[] = [];
  for (const relativePath of enumeration.paths) {
    if (!relativePath.endsWith(".md")) continue;
    const domain = mapDomain(relativePath);
    if (!domain) {
      diagnostics.push({
        code: "bundle.unknown-file",
        severity: "warning",
        message: "Unknown Markdown file was ignored.",
        path: relativePath,
      });
      continue;
    }
    try {
      const bytes = await readFile(resolve(root, relativePath));
      const parsed = parseContentFile({ path: relativePath, domain, bytes });
      diagnostics.push(...parsed.diagnostics);
      if (parsed.value) entries.push(...parsed.value);
    } catch {
      diagnostics.push({
        code: "bundle.read-error",
        severity: "error",
        message: "Bundle content file could not be read.",
        path: relativePath,
      });
    }
  }

  if (diagnostics.some(({ severity }) => severity === "error")) {
    return failure(...diagnostics);
  }

  const identityMetadata =
    entries.find(({ domain }) => domain === "identity")?.frontMatter ?? {};
  return {
    value: Object.freeze({
      reference: input.reference,
      path: root,
      ...(input.nodePath === undefined ? {} : { nodePath: input.nodePath }),
      isRoot: input.isRoot,
      identityMetadata,
      entries: Object.freeze(entries),
    }),
    diagnostics: sortDiagnostics(diagnostics),
  };
}

function isLogicalNodePath(value: string): boolean {
  if (value.length === 0 || value.startsWith("/") || value.endsWith("/")) {
    return false;
  }
  return value
    .split("/")
    .every(
      (segment) => segment.length > 0 && segment !== "." && segment !== "..",
    );
}

async function enumerate(root: string): Promise<{
  readonly paths: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}> {
  const paths: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const visitedDirectories = new Set<string>();

  async function visit(
    directory: string,
    displayDirectory: string,
  ): Promise<void> {
    let canonicalDirectory: string;
    try {
      canonicalDirectory = await realpath(directory);
    } catch {
      diagnostics.push(readError(displayDirectory));
      return;
    }
    if (!isContained(root, canonicalDirectory)) {
      diagnostics.push(escapingSymlink(displayDirectory));
      return;
    }
    if (visitedDirectories.has(canonicalDirectory)) return;
    visitedDirectories.add(canonicalDirectory);

    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch {
      diagnostics.push(readError(displayDirectory));
      return;
    }
    children.sort((left, right) => compareUtf8Bytes(left.name, right.name));
    for (const child of children) {
      const childPath = resolve(directory, child.name);
      const relativePath = displayDirectory
        ? `${displayDirectory}/${child.name}`
        : child.name;
      let realChildPath: string;
      try {
        realChildPath = await realpath(childPath);
      } catch {
        diagnostics.push(readError(relativePath));
        continue;
      }
      if (!isContained(root, realChildPath)) {
        diagnostics.push(escapingSymlink(relativePath));
        continue;
      }
      let childStat;
      try {
        childStat = await stat(childPath);
      } catch {
        diagnostics.push(readError(relativePath));
        continue;
      }
      if (childStat.isDirectory()) {
        await visit(childPath, relativePath);
      } else if (childStat.isFile()) {
        paths.push(relativePath);
      }
    }
  }

  await visit(root, "");
  paths.sort(compareUtf8Bytes);
  return { paths, diagnostics: sortDiagnostics(diagnostics) };
}

function isContained(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function escapingSymlink(path: string): Diagnostic {
  return {
    code: "bundle.escaping-symlink",
    severity: "error",
    message: "Bundle path resolves outside the bundle root.",
    path,
  };
}

function readError(path: string): Diagnostic {
  return {
    code: "bundle.read-error",
    severity: "error",
    message: "Bundle path could not be read.",
    path,
  };
}

function failure(
  ...diagnostics: readonly Diagnostic[]
): OperationResult<never> {
  return { diagnostics: sortDiagnostics(diagnostics) };
}
