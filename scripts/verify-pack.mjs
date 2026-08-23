import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertExactInventory,
  assertRepeatablePack,
  expectedPackageFiles,
} from "./package-inventory.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(root, "packages/orgmd");

let tarball;
let consumer;
let npmCache;

try {
  npmCache = await mkdtemp(resolve(tmpdir(), "orgmd-pack-cache-"));
  const expectedFiles = await expectedPackageFiles(root, packageRoot);
  const first = packWorkspace();
  assertExactInventory(first.files, expectedFiles);
  const result = packWorkspace();
  assertExactInventory(result.files, expectedFiles);
  assertRepeatablePack(first, result);

  tarball = resolve(root, result.filename);

  consumer = await mkdtemp(resolve(tmpdir(), "orgmd-pack-consumer-"));
  exec("npm", ["install", "--no-package-lock", tarball], {
    cwd: consumer,
  });
  const installed = resolve(consumer, "node_modules", "orgmd");
  const manifest = JSON.parse(
    await readFile(resolve(installed, "package.json"), "utf8"),
  );
  if (manifest.scripts !== undefined)
    throw new Error("Packed manifest exposes workspace lifecycle scripts.");
  if (manifest.devDependencies !== undefined)
    throw new Error("Packed manifest exposes development dependencies.");
  exec("npm", ["pack", "--json"], { cwd: installed });
  exec(
    "node",
    [
      "--input-type=module",
      "--eval",
      "import { resolveContext } from 'orgmd'; if (typeof resolveContext !== 'function') process.exit(1);",
    ],
    { cwd: consumer },
  );
  exec(
    "node",
    [
      "--input-type=module",
      "--eval",
      "import { resolveContext } from 'orgmd'; import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); if (typeof resolveContext !== 'function' || !require('orgmd/schema').$schema || !require('orgmd/conformance/manifest').version) process.exit(1);",
    ],
    { cwd: consumer },
  );
  const version = exec("npx", ["--no-install", "orgmd", "--version"], {
    cwd: consumer,
  }).trim();
  if (version !== "0.5.0")
    throw new Error(
      `Packed CLI reported ${JSON.stringify(version)}, not \"0.5.0\".`,
    );
  await cp(resolve(root, "org"), resolve(consumer, "fixture"), {
    recursive: true,
  });
  exec("npx", ["--no-install", "orgmd", "validate", "fixture"], {
    cwd: consumer,
  });
} finally {
  if (tarball) await rm(tarball, { force: true });
  if (consumer) await rm(consumer, { force: true, recursive: true });
  if (npmCache) await rm(npmCache, { force: true, recursive: true });
}

function exec(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, npm_config_cache: npmCache },
    ...options,
  });
}

function packWorkspace() {
  const packed = JSON.parse(
    exec("npm", ["pack", "--json", "--workspace", "orgmd"]),
  );
  const result = packed[0];
  if (
    !result ||
    typeof result.filename !== "string" ||
    !Array.isArray(result.files)
  )
    throw new Error("npm pack did not return a complete tarball result.");
  return result;
}
