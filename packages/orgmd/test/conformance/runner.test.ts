import { describe, expect, it } from "vitest";
import { executeVector, loadManifest, loadVectors } from "./load-vector.js";

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

describe.each(loadVectors())("$name", (vector) => {
  it("matches the fixed expected result", async () => {
    expect(await executeVector(vector)).toEqual(vector.expected);
  });
});
