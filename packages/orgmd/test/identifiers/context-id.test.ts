import { describe, expect, it } from "vitest";
import {
  computeContextId,
  type BundleVersion,
} from "../../src/identifiers/context-id.js";

const root: BundleVersion = {
  bundleId: "root",
  path: "/root",
  contentId: "sha256:aaa",
};
const leaf: BundleVersion = {
  bundleId: "leaf",
  path: "/root/leaf",
  contentId: "sha256:bbb",
};

describe("Core context identifiers", () => {
  it("locks Mode A and spec 0.3.1 into the fixed JCS input", () => {
    expect(
      computeContextId([root, leaf], ["public", "internal", "public"]),
    ).toBe(
      "sha256:d5e9ab44e9b04bea149d98378d38482351092905b07ad68692f742c4aae803a9",
    );
  });

  it("sorts and de-duplicates clearance labels by UTF-8 byte order", () => {
    expect(computeContextId([root, leaf], ["public", "internal"])).toBe(
      computeContextId([root, leaf], ["internal", "public", "public"]),
    );
  });

  it("preserves resolution-path order", () => {
    expect(computeContextId([leaf, root], ["public", "internal"])).toBe(
      "sha256:256ca9810723f6d69e3bcfc06ece609072838e812fc93b6bed45f85332f10305",
    );
    expect(computeContextId([leaf, root], ["public", "internal"])).not.toBe(
      computeContextId([root, leaf], ["public", "internal"]),
    );
  });

  it("does not include local filesystem paths", () => {
    expect(
      computeContextId([{ ...root, path: "/different" }], ["public"]),
    ).toBe(computeContextId([root], ["public"]));
  });
});
