import { readdir } from "node:fs/promises";
import { resolve, sep } from "node:path";

export async function expectedPackageFiles(root, packageRoot) {
  const sourceFiles = await listRegularFiles(resolve(packageRoot, "src"));
  const compiledFiles = sourceFiles.flatMap((source) => {
    if (!source.endsWith(".ts"))
      throw new Error(`Unexpected non-TypeScript source file: ${source}`);
    const stem = source.slice(0, -3);
    return [`dist/${stem}.d.ts`, `dist/${stem}.js`];
  });
  const conformanceFiles = (
    await listRegularFiles(resolve(root, "conformance", "core-v0.1"))
  ).map((path) => `dist/conformance/core-v0.1/${path}`);

  return [
    "LICENSE",
    "README.md",
    ...compiledFiles,
    ...conformanceFiles,
    "dist/schema/entry.schema.json",
    "package.json",
  ].sort(comparePaths);
}

export function assertExactInventory(actual, expected) {
  const actualPaths = actual
    .map((file) => (typeof file === "string" ? file : file.path))
    .sort(comparePaths);
  const expectedPaths = [...expected].sort(comparePaths);
  const actualSet = new Set(actualPaths);
  const expectedSet = new Set(expectedPaths);
  const missing = expectedPaths.filter((path) => !actualSet.has(path));
  const unexpected = actualPaths.filter((path) => !expectedSet.has(path));
  const duplicates = actualPaths.filter(
    (path, index) => index > 0 && path === actualPaths[index - 1],
  );
  if (
    missing.length === 0 &&
    unexpected.length === 0 &&
    duplicates.length === 0
  )
    return;

  const differences = [];
  if (missing.length > 0) differences.push(`missing: ${missing.join(", ")}`);
  if (unexpected.length > 0)
    differences.push(`unexpected: ${unexpected.join(", ")}`);
  if (duplicates.length > 0)
    differences.push(`duplicates: ${duplicates.join(", ")}`);
  throw new Error(
    `Packed orgmd inventory mismatch (${differences.join("; ")}).`,
  );
}

export function assertRepeatablePack(first, second) {
  const firstSignature = packSignature(first);
  const secondSignature = packSignature(second);
  if (firstSignature !== secondSignature)
    throw new Error(
      `Packed orgmd repeat pack mismatch.\nFirst: ${firstSignature}\nSecond: ${secondSignature}`,
    );
}

async function listRegularFiles(root) {
  const files = [];
  await visit(root, "", files);
  return files.sort(comparePaths);
}

async function visit(root, directory, files) {
  const entries = await readdir(resolve(root, directory), {
    withFileTypes: true,
  });
  entries.sort((left, right) => comparePaths(left.name, right.name));
  for (const entry of entries) {
    const localPath =
      directory === "" ? entry.name : `${directory}/${entry.name}`;
    if (entry.isDirectory()) await visit(root, localPath, files);
    else if (entry.isFile()) files.push(toPackagePath(localPath));
    else throw new Error(`Package input is not a regular file: ${localPath}`);
  }
}

function packSignature(result) {
  const files = result.files
    .map((file) => ({ path: file.path, size: file.size, mode: file.mode }))
    .sort((left, right) => comparePaths(left.path, right.path));
  return JSON.stringify({
    shasum: result.shasum,
    integrity: result.integrity,
    files,
  });
}

function toPackagePath(path) {
  return sep === "/" ? path : path.split(sep).join("/");
}

function comparePaths(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
