import { execFileSync } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "dist/cli/bin.js",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/schema/entry.schema.json",
  "dist/conformance/core-v0.1/manifest.json",
  "README.md",
  "LICENSE",
  "package.json",
];

let tarball;
let consumer;
let npmCache;

try {
  npmCache = await mkdtemp(resolve(tmpdir(), "orgmd-pack-cache-"));
  const packed = JSON.parse(
    exec("npm", ["pack", "--json", "--workspace", "orgmd"]),
  );
  const result = packed[0];
  if (!result || typeof result.filename !== "string")
    throw new Error("npm pack did not return a tarball filename.");

  tarball = resolve(root, result.filename);
  const files = result.files.map((file) => file.path);
  const missing = required.filter((path) => !files.includes(path));
  if (missing.length > 0)
    throw new Error(`Packed orgmd tarball is missing: ${missing.join(", ")}`);

  consumer = await mkdtemp(resolve(tmpdir(), "orgmd-pack-consumer-"));
  exec("npm", ["install", "--ignore-scripts", "--no-package-lock", tarball], {
    cwd: consumer,
  });
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
