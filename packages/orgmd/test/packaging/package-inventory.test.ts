import { describe, expect, it } from "vitest";
import {
  assertExactInventory,
  assertRepeatablePack,
} from "../../../../scripts/package-inventory.mjs";

describe("package inventory verification", () => {
  it("rejects files outside the public allowlist", () => {
    expect(() =>
      assertExactInventory(
        ["dist/index.js", "dist/stale-ignored.js", "package.json"],
        ["dist/index.js", "package.json"],
      ),
    ).toThrow(/unexpected: dist\/stale-ignored\.js/);
  });

  it("rejects missing allowlisted files", () => {
    expect(() =>
      assertExactInventory(
        ["dist/index.js"],
        ["dist/index.d.ts", "dist/index.js"],
      ),
    ).toThrow(/missing: dist\/index\.d\.ts/);
  });

  it("accepts repeated packs only when inventory and digests match", () => {
    const first = {
      shasum: "abc123",
      integrity: "sha512-first",
      files: [
        { path: "package.json", size: 100, mode: 420 },
        { path: "dist/index.js", size: 200, mode: 420 },
      ],
    };
    const same = {
      ...first,
      files: [...first.files].reverse(),
    };
    const changed = {
      ...first,
      shasum: "def456",
      files: [
        { path: "package.json", size: 100, mode: 420 },
        { path: "dist/index.js", size: 201, mode: 420 },
      ],
    };

    expect(() => assertRepeatablePack(first, same)).not.toThrow();
    expect(() => assertRepeatablePack(first, changed)).toThrow(
      /repeat pack mismatch/,
    );
  });
});
