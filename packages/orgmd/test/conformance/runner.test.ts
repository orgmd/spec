import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  executeVector,
  loadManifest,
  loadVectors,
  loadVectorsFrom,
} from "./load-vector.js";

it("loads the declared Core suite and exercises every declared operation", () => {
  const manifest = loadManifest();
  expect(manifest).toEqual({
    suite: "orgmd-core",
    version: "0.1.0",
    spec_version: "0.3.1",
    operations: ["parse", "validate", "content-id", "context-id", "resolve"],
  });
  expect(new Set(loadVectors().map(({ operation }) => operation))).toEqual(
    new Set(manifest.operations),
  );
});

it("rejects an external JSON symlink instead of reading outside the corpus", () => {
  const root = mkdtempSync(join(tmpdir(), "orgmd-conformance-"));
  const cases = join(root, "cases");
  const external = join(root, "external.json");
  mkdirSync(cases);
  writeFileSync(
    external,
    JSON.stringify({
      name: "external",
      operation: "parse",
      input: {},
      expected: {},
    }),
  );
  symlinkSync(external, join(cases, "escape.json"));

  try {
    expect(() => loadVectorsFrom(cases)).toThrowError(
      "conformance corpus must not contain symlinks",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.each(loadVectors())("$name", (vector) => {
  it("matches the fixed expected result byte-identically on repeat", async () => {
    const first = await executeVector(vector);
    const second = await executeVector(vector);
    expect(first).toEqual(vector.expected);
    expect(second).toEqual(vector.expected);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

it("keeps deterministic resolution and error ordering across 25 executions", async () => {
  const vector = loadVectors().find(
    ({ name }) =>
      name ===
      "narrowing errors have id blast radius deterministic order and clearance-safe ids",
  );
  if (!vector) throw new Error("deterministic resolver vector is missing");

  const results = await Promise.all(
    Array.from({ length: 25 }, () => executeVector(vector)),
  );
  expect(new Set(results.map((result) => JSON.stringify(result)))).toEqual(
    new Set([JSON.stringify(vector.expected)]),
  );
});

it.each([
  [
    "content id hashes empty metadata and every revision",
    "content id is invariant to entry enumeration order",
  ],
  [
    "context id fixes Mode A spec version path and clearance",
    "context id is invariant to clearance order and duplicates",
  ],
])(
  "keeps irrelevant input permutation invariant: %s",
  async (base, permuted) => {
    const vectors = loadVectors();
    const baseVector = vectors.find(({ name }) => name === base);
    const permutedVector = vectors.find(({ name }) => name === permuted);
    if (!baseVector || !permutedVector) {
      throw new Error("permutation conformance vector is missing");
    }

    expect(JSON.stringify(await executeVector(permutedVector))).toBe(
      JSON.stringify(await executeVector(baseVector)),
    );
  },
);
