import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateBundlePath } from "../../src/validation/validate.js";

describe("repository ORG.md bundle", () => {
  it("validates without error-severity diagnostics", async () => {
    const orgPath = fileURLToPath(new URL("../../../../org", import.meta.url));
    const result = await validateBundlePath(orgPath, { isRoot: true });

    expect(
      result.diagnostics.filter(({ severity }) => severity === "error"),
    ).toEqual([]);
    expect(result.value?.entries.length).toBeGreaterThan(0);
  });
});
