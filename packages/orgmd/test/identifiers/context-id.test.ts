import { describe, expect, it } from "vitest";
import {
  computeContextId,
  type BundleVersion,
} from "../../src/identifiers/context-id.js";

const root: BundleVersion = {
  bundleId: "root",
  path: "root",
  contentId: "sha256:aaa",
};
const leaf: BundleVersion = {
  bundleId: "leaf",
  path: "root/leaf",
  contentId: "sha256:bbb",
};

describe("Core context identifiers", () => {
  it("locks Mode A and spec 0.3.1 into the fixed JCS input", () => {
    expect(
      computeContextId([root, leaf], ["public", "internal", "public"]),
    ).toBe(
      "sha256:9a3e816cc4b26e84fcfed38a83fa36dfe28669c585cf00d83f5082c8fdf40813",
    );
  });

  it("sorts and de-duplicates clearance labels by UTF-8 byte order", () => {
    expect(computeContextId([root, leaf], ["public", "internal"])).toBe(
      computeContextId([root, leaf], ["internal", "public", "public"]),
    );
  });

  it("preserves resolution-path order", () => {
    expect(computeContextId([leaf, root], ["public", "internal"])).toBe(
      "sha256:f34182c7ee0aee66ea536136baa7db4ad8af013b094c226d6ff5dab13c6b80f0",
    );
    expect(computeContextId([leaf, root], ["public", "internal"])).not.toBe(
      computeContextId([root, leaf], ["public", "internal"]),
    );
  });

  it("treats logical node placement as resolution-affecting", () => {
    expect(computeContextId([{ ...root, path: "other" }], ["public"])).not.toBe(
      computeContextId([root], ["public"]),
    );
  });

  it("does not include an incidental physical filesystem path", () => {
    const withPhysicalPath = {
      ...root,
      physicalPath: "/private/tmp/root",
    } as BundleVersion;
    expect(computeContextId([withPhysicalPath], ["public"])).toBe(
      computeContextId([root], ["public"]),
    );
  });
});
