import { cp, lstat, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(root, "packages/orgmd");
const dist = resolve(packageRoot, "dist");

await rm(dist, { force: true, recursive: true });
await copyFile(
  resolve(root, "LICENSE-APACHE"),
  resolve(packageRoot, "LICENSE"),
);
await copyTree(
  resolve(root, "schema", "entry.schema.json"),
  resolve(dist, "schema", "entry.schema.json"),
);
await copyTree(
  resolve(root, "conformance", "core-v0.1"),
  resolve(dist, "conformance", "core-v0.1"),
);

async function copyFile(source, destination) {
  await assertNotSymlink(source);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { force: true, verbatimSymlinks: true });
}

async function copyTree(source, destination) {
  const sourceStat = await assertNotSymlink(source);
  if (sourceStat.isFile()) return copyFile(source, destination);
  if (!sourceStat.isDirectory())
    throw new Error(
      `Package asset source is not a regular file or directory: ${source}`,
    );

  await rm(destination, { force: true, recursive: true });
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  for (const entry of entries)
    await copyTree(
      resolve(source, entry.name),
      resolve(destination, entry.name),
    );
}

async function assertNotSymlink(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink())
    throw new Error(`Refusing to copy symlinked package asset: ${path}`);
  return stat;
}
