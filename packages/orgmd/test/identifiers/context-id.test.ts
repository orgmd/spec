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
  it("includes the validated temporal resolution date in the versioned contract", () => {
    expect(
      computeContextId(
        [root, leaf],
        ["public", "internal", "public"],
        "2026-08-21",
      ),
    ).toBe(
      "sha256:3109681a7b58facc6663ff66c0144ac9e2b3764586da07b3c89d4d0bc06b7c52",
    );
    expect(
      computeContextId(
        [root, leaf],
        ["public", "internal", "public"],
        "2028-08-21",
      ),
    ).toBe(
      "sha256:8d7d5030598025b9c93eff80503f82f383a46d9b8a4fdb0728fc005c71562c13",
    );
  });

  it("locks Mode A and spec 0.3.1 into the fixed JCS input", () => {
    expect(
      computeContextId(
        [root, leaf],
        ["public", "internal", "public"],
        "2026-08-21",
      ),
    ).toBe(
      "sha256:3109681a7b58facc6663ff66c0144ac9e2b3764586da07b3c89d4d0bc06b7c52",
    );
  });

  it("sorts and de-duplicates clearance labels by UTF-8 byte order", () => {
    expect(
      computeContextId([root, leaf], ["public", "internal"], "2026-08-21"),
    ).toBe(
      computeContextId(
        [root, leaf],
        ["internal", "public", "public"],
        "2026-08-21",
      ),
    );
  });

  it("preserves resolution-path order", () => {
    expect(
      computeContextId([leaf, root], ["public", "internal"], "2026-08-21"),
    ).toBe(
      "sha256:e0acae992f351ba336a5fd95b6457517a92355233d66d7bd42188122b82a3ce0",
    );
    expect(
      computeContextId([leaf, root], ["public", "internal"], "2026-08-21"),
    ).not.toBe(
      computeContextId([root, leaf], ["public", "internal"], "2026-08-21"),
    );
  });

  it("treats logical node placement as resolution-affecting", () => {
    expect(
      computeContextId([{ ...root, path: "other" }], ["public"], "2026-08-21"),
    ).not.toBe(computeContextId([root], ["public"], "2026-08-21"));
  });

  it("does not include an incidental physical filesystem path", () => {
    const withPhysicalPath = {
      ...root,
      physicalPath: "/private/tmp/root",
    } as BundleVersion;
    expect(computeContextId([withPhysicalPath], ["public"], "2026-08-21")).toBe(
      computeContextId([root], ["public"], "2026-08-21"),
    );
  });

  it("includes normalized bundle failure state", () => {
    const failures = [
      {
        bundleIndex: 1,
        code: "unparseable_bundle" as const,
        detail: "The designated bundle could not be parsed.",
      },
      {
        bundleIndex: 0,
        code: "integrity_failure" as const,
        detail: "Bundle integrity verification failed.",
      },
    ];
    const reversed = [...failures].reverse();

    expect(
      computeContextId([root, leaf], ["public"], "2026-08-21", failures),
    ).toBe(
      "sha256:63f6bf74a723fd04de113308c89081d8994f0e77f2d7cc975209806e6aad4709",
    );
    expect(
      computeContextId([root, leaf], ["public"], "2026-08-21", reversed),
    ).toBe(
      "sha256:63f6bf74a723fd04de113308c89081d8994f0e77f2d7cc975209806e6aad4709",
    );
  });
});
